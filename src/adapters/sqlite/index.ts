/* eslint-disable global-require */
import type { ConnectionTag } from '../../utils/common'
import { connectionTag, logger, invariant } from '../../utils/common'
import type { ResultCallback } from '../../utils/fp/Result'
import { mapValue, toPromise } from '../../utils/fp/Result'
import type { RecordId } from '../../Model'
import type { SerializedQuery } from '../../Query'
import type { TableName, AppSchema, SchemaVersion } from '../../Schema'
import type { SchemaMigrations, MigrationStep } from '../../Schema/migrations'
import type {
  DatabaseAdapter,
  CachedQueryResult,
  CachedFindResult,
  BatchOperation,
  UnsafeExecuteOperations,
} from '../type'
import {
  sanitizeFindResult,
  sanitizeQueryResult,
  devSetupCallback,
  validateAdapter,
  validateTable,
} from '../common'
import type {
  SQL,
  SQLiteAdapterOptions,
  SQLiteArg,
  SQLiteQuery,
  SqliteDispatcher,
  MigrationEvents,
} from './type'
import encodeQuery from './encodeQuery'
import { makeDispatcher } from './makeDispatcher'
export type { SQL, SQLiteArg, SQLiteQuery }

if (process.env.NODE_ENV !== 'production') {
  require('./devtools')
}

const IGNORE_CACHE = 0
export default class SQLiteAdapter implements DatabaseAdapter {
  static adapterType: string = 'sqlite'
  schema: AppSchema
  migrations: SchemaMigrations | null | undefined
  _migrationEvents: MigrationEvents | null | undefined
  _tag: ConnectionTag = connectionTag()
  dbName: string
  _dispatcher: SqliteDispatcher
  _initPromise: Promise<void>

  constructor(options: SQLiteAdapterOptions) {
    // console.log(`---> Initializing new adapter (${this._tag})`)
    const {
      dbName,
      schema,
      migrations,
      migrationEvents,
      usesExclusiveLocking = false,
    } = options
    this.schema = schema
    this.migrations = migrations
    this._migrationEvents = migrationEvents
    this.dbName = this._getName(dbName)
    this._dispatcher = makeDispatcher(this.dbName, { usesExclusiveLocking })

    if (process.env.NODE_ENV !== 'production') {
      validateAdapter(this)
    }

    this._initPromise = toPromise((callback) => {
      this._init((result) => {
        callback(result)
        devSetupCallback(result, options.onSetUpError)
      })
    })
  }

  get initializingPromise(): Promise<void> {
    return this._initPromise
  }

  // eslint-disable-next-line no-use-before-define
  async testClone(
    options: Partial<SQLiteAdapterOptions> = {}
  ): Promise<SQLiteAdapter> {
    // $FlowFixMe
    const clone = new SQLiteAdapter({
      dbName: this.dbName,
      schema: this.schema,
      ...(this.migrations
        ? {
            migrations: this.migrations,
          }
        : {}),
      ...options,
    })
    await clone._initPromise
    return clone
  }

  _getName(name: string | null | undefined): string {
    if (process.env.NODE_ENV === 'test') {
      return name || `file:testdb${this._tag}?mode=memory&cache=shared`
    }

    return name || 'watermelon'
  }

  // The native side runs setUp* only after our `initialize` round-trip, so user calls must wait for it.
  // Dispatch even if init failed: recovery (unsafeResetDatabase) must still reach the database.
  _call(
    name: Parameters<SqliteDispatcher['call']>[0],
    args: any[],
    callback: ResultCallback<any>
  ): void {
    const go = (): void => this._dispatcher.call(name, args, callback)
    this._initPromise.then(go, go)
  }

  _init(callback: ResultCallback<void>): void {
    // Try to initialize the database with just the schema number. If it matches the database,
    // we're good. If not, we try again, this time sending the compiled schema or a migration set
    // This is to speed up the launch (less to do and pass through bridge), and avoid repeating
    // migration logic inside native code
    this._dispatcher.call('initialize', [this.schema.version], (result) => {
      if (result.error) {
        callback(result)
        return
      }

      const status = result.value

      if (status.code === 'schema_needed') {
        this._setUpWithSchema(callback)
      } else if (status.code === 'migrations_needed') {
        this._setUpWithMigrations(status.databaseVersion, callback)
      } else if (status.code !== 'ok') {
        callback({
          error: new Error('Invalid database initialization status'),
        })
      } else {
        callback({
          value: undefined,
        })
      }
    })
  }

  _setUpWithMigrations(
    databaseVersion: SchemaVersion,
    callback: ResultCallback<void>
  ): void {
    logger.log('[SQLite] Database needs migrations')
    invariant(databaseVersion > 0, 'Invalid database schema version')

    const migrationSteps = this._migrationSteps(databaseVersion)

    if (migrationSteps) {
      logger.log(
        `[SQLite] Migrating from version ${databaseVersion} to ${this.schema.version}...`
      )

      if (this._migrationEvents && this._migrationEvents.onStart) {
        this._migrationEvents.onStart()
      }

      this._dispatcher.call(
        'setUpWithMigrations',
        [
          require('./encodeSchema').encodeMigrationSteps(migrationSteps),
          databaseVersion,
          this.schema.version,
        ],
        (result) => {
          if (result.error) {
            logger.error('[SQLite] Migration failed', result.error)

            if (this._migrationEvents && this._migrationEvents.onError) {
              this._migrationEvents.onError(result.error)
            }
          } else {
            logger.log('[SQLite] Migration successful')

            if (this._migrationEvents && this._migrationEvents.onSuccess) {
              this._migrationEvents.onSuccess()
            }
          }

          callback(result)
        }
      )
    } else {
      logger.warn(
        '[SQLite] Migrations not available for this version range, resetting database instead'
      )

      this._setUpWithSchema(callback)
    }
  }

  _setUpWithSchema(callback: ResultCallback<void>): void {
    logger.log(
      `[SQLite] Setting up database with schema version ${this.schema.version}`
    )

    this._dispatcher.call(
      'setUpWithSchema',
      [this._encodedSchema(), this.schema.version],
      (result) => {
        if (!result.error) {
          logger.log(`[SQLite] Schema set up successfully`)
        }

        callback(result)
      }
    )
  }

  find(
    table: TableName<any>,
    id: RecordId,
    callback: ResultCallback<CachedFindResult>
  ): void {
    validateTable(table, this.schema)

    this._call('find', [table, id], (result) =>
      callback(
        mapValue(
          (rawRecord) =>
            sanitizeFindResult(rawRecord, this.schema.tables[table]),
          result
        )
      )
    )
  }

  query(
    query: SerializedQuery,
    callback: ResultCallback<CachedQueryResult>
  ): void {
    validateTable(query.table, this.schema)
    const { table } = query
    const [sql, args] = encodeQuery(query)

    this._call('query', [table, sql, args], (result) =>
      callback(
        mapValue(
          (rawRecords) =>
            sanitizeQueryResult(rawRecords, this.schema.tables[table]),
          result
        )
      )
    )
  }

  queryIds(query: SerializedQuery, callback: ResultCallback<RecordId[]>): void {
    validateTable(query.table, this.schema)

    this._call(
      'queryIds', // $FlowFixMe
      encodeQuery(query),
      callback
    )
  }

  unsafeQueryRaw(
    query: SerializedQuery,
    callback: ResultCallback<any[]>
  ): void {
    validateTable(query.table, this.schema)

    this._call(
      'unsafeQueryRaw', // $FlowFixMe
      encodeQuery(query),
      callback
    )
  }

  count(query: SerializedQuery, callback: ResultCallback<number>): void {
    validateTable(query.table, this.schema)

    this._call(
      'count', // $FlowFixMe
      encodeQuery(query, true),
      callback
    )
  }

  batch(operations: BatchOperation[], callback: ResultCallback<void>): void {
    this._call(
      'batch',
      [require('./encodeBatch').default(operations, this.schema)],
      callback
    )
  }

  getDeletedRecords(
    table: TableName<any>,
    callback: ResultCallback<RecordId[]>
  ): void {
    validateTable(table, this.schema)

    this._call(
      'queryIds',
      [`select id from "${table}" where _status='deleted'`, []],
      callback
    )
  }

  destroyDeletedRecords(
    table: TableName<any>,
    recordIds: RecordId[],
    callback: ResultCallback<void>
  ): void {
    validateTable(table, this.schema)
    const operation = [
      0,
      null,
      `delete from "${table}" where "id" == ?`,
      recordIds.map((id) => [id]),
    ]

    this._call('batch', [[operation]], callback)
  }

  unsafeResetDatabase(callback: ResultCallback<void>): void {
    this._call(
      'unsafeResetDatabase',
      [this._encodedSchema(), this.schema.version],
      (result) => {
        if (!result.error) {
          logger.log('[SQLite] Database is now reset')
        }

        callback(result)
      }
    )
  }

  unsafeExecute(
    operations: UnsafeExecuteOperations,
    callback: ResultCallback<void>
  ): void {
    const { sqls, sqlString } = operations as {
      sqls?: SQLiteQuery[]
      sqlString?: SQL
    }

    if (process.env.NODE_ENV !== 'production') {
      invariant(
        operations &&
          typeof operations === 'object' &&
          Object.keys(operations).length === 1 &&
          (Array.isArray(sqls) || typeof sqlString === 'string'),
        "unsafeExecute expects an { sqls: [ [sql, [args..]], ... ] } or { sqlString: 'foo; bar' } object"
      )
    }

    if (sqls) {
      const batchOperations = sqls.map(([sql, args]) => [
        IGNORE_CACHE,
        null,
        sql,
        [args],
      ])

      this._call('batch', [batchOperations], callback)
    } else if (sqlString) {
      this._call('unsafeExecuteMultiple', [sqlString], callback)
    }
  }

  getLocal(
    key: string,
    callback: ResultCallback<string | null | undefined>
  ): void {
    this._call('getLocal', [key], callback)
  }

  setLocal(key: string, value: string, callback: ResultCallback<void>): void {
    invariant(
      typeof value === 'string',
      'adapter.setLocal() value must be a string'
    )
    const operation = [
      IGNORE_CACHE,
      null,
      `insert or replace into "local_storage" ("key", "value") values (?, ?)`,
      [[key, value]],
    ]

    this._call('batch', [[operation]], callback)
  }

  removeLocal(key: string, callback: ResultCallback<void>): void {
    const operation = [
      IGNORE_CACHE,
      null,
      `delete from "local_storage" where "key" == ?`,
      [[key]],
    ]

    this._call('batch', [[operation]], callback)
  }

  _encodedSchema(): SQL {
    return require('./encodeSchema').encodeSchema(this.schema)
  }

  _migrationSteps(
    fromVersion: SchemaVersion
  ): MigrationStep[] | null | undefined {
    const {
      stepsForMigration,
    } = require('../../Schema/migrations/stepsForMigration')

    const { migrations } = this

    // TODO: Remove this after migrations are shipped
    if (!migrations) {
      return null
    }

    return stepsForMigration({
      migrations,
      fromVersion,
      toVersion: this.schema.version,
    })
  }
}
