import { NitroModules } from 'react-native-nitro-modules'
import type { DatabasePaths } from '../../../specs/DatabasePaths.nitro'
import type { NativeDatabase } from '../../../specs/NativeDatabase.nitro'
import type { NativeDatabaseFactory } from '../../../specs/NativeDatabaseFactory.nitro'
import type {
  NativeReadCall,
  NativeReadMethod,
  NativeReadResult,
} from '../../../specs/NativeReadCall'
import type {
  ResultCallback,
  SqliteDispatcher,
  SqliteDispatcherMethod,
  SqliteDispatcherOptions,
} from '../type'

const factory = NitroModules.createHybridObject<NativeDatabaseFactory>(
  'NativeDatabaseFactory'
)
const paths = NitroModules.createHybridObject<DatabasePaths>('DatabasePaths')

const resolveDatabasePath = (dbName: string): string =>
  dbName === '' ||
    dbName === ':memory:' ||
    dbName.startsWith('file:') ||
    dbName.startsWith('/')
    ? dbName
    : `${paths.databaseDirectory}/${dbName}.db`

// Single-row primary-key reads. When no async call is in flight the native queue is idle, so running these
// synchronously keeps call ordering, can't wait on the lock, and skips two thread hops + a Promise.
const IDLE_SYNC_METHODS: Partial<Record<SqliteDispatcherMethod, true>> = {
  find: true,
  getLocal: true,
}

// Async reads issued in the same tick go to native as one readMany call (one queue hop + one Promise).
const READ_RESULT_KEY: Partial<
  Record<SqliteDispatcherMethod, keyof NativeReadResult>
> = {
  find: 'find',
  query: 'records',
  queryIds: 'ids',
  unsafeQueryRaw: 'records',
  count: 'count',
  getLocal: 'local',
}

const toReadCall = (name: SqliteDispatcherMethod, args: any[]): NativeReadCall => {
  const method = name as NativeReadMethod
  switch (method) {
    case 'find':
      return { method, table: args[0], sql: '', args: [args[1]] }
    case 'query':
      return { method, table: args[0], sql: args[1], args: args[2] }
    case 'getLocal':
      return { method, table: '', sql: '', args: [args[0]] }
    default: // queryIds, unsafeQueryRaw, count: (sql, args)
      return { method, table: '', sql: args[0], args: args[1] }
  }
}

// One throwing callback must not stop the rest of a readMany from being delivered
const deliver = (callback: ResultCallback<any>, result: any): void => {
  try {
    callback(result)
  } catch (error) {
    queueMicrotask(() => {
      throw error
    })
  }
}

type Read = [SqliteDispatcherMethod, any[], ResultCallback<any>]

class SqliteNitroDispatcher implements SqliteDispatcher {
  _db: NativeDatabase

  _synchronous: boolean

  _pending: number = 0 // async calls whose callback hasn't run yet

  _reads: Read[] = [] // async reads waiting for this tick's readMany

  constructor(
    dbName: string,
    { usesExclusiveLocking, synchronous }: SqliteDispatcherOptions
  ) {
    this._synchronous = synchronous
    this._db = factory.createDatabase(
      resolveDatabasePath(dbName),
      usesExclusiveLocking
    )
  }

  callSync(name: SqliteDispatcherMethod, args: any[]): any {
    // method calls (not detached references) keep `this` bound for Nitro
    return (this._db[`${name}Sync`] as (...a: any[]) => unknown).apply(
      this._db,
      args
    )
  }

  call(
    name: SqliteDispatcherMethod,
    args: any[],
    callback: ResultCallback<any>
  ): void {
    // method calls (not detached references) keep `this` bound for Nitro
    if (
      this._synchronous ||
      (this._pending === 0 && IDLE_SYNC_METHODS[name])
    ) {
      let value: unknown
      try {
        value = this.callSync(name, args)
      } catch (error) {
        callback({ error: error as Error })
        return
      }
      callback({ value }) // outside try: a throwing callback must not be reported twice
      return
    }
    this._pending++
    if (READ_RESULT_KEY[name]) {
      if (this._reads.push([name, args, callback]) === 1) {
        queueMicrotask(() => this._flushReads())
      }
      return
    }
    this._flushReads() // earlier reads must reach the serial native queue first
    this._callAsync(name, args, callback)
  }

  _callAsync(
    name: SqliteDispatcherMethod,
    args: any[],
    callback: ResultCallback<any>
  ): void {
    ; (this._db[name as Exclude<SqliteDispatcherMethod, 'forget'>] as (...a: any[]) => Promise<unknown>)
      .apply(this._db, args)
      .then(
        (value) => {
          this._pending--
          callback({ value })
        },
        (error) => {
          this._pending--
          callback({ error })
        }
      )
  }

  _flushReads(): void {
    const reads = this._reads
    if (reads.length === 0) {
      return
    }
    this._reads = []
    if (reads.length === 1) {
      this._callAsync(...reads[0]!)
      return
    }
    this._db.readMany(reads.map(([name, args]) => toReadCall(name, args))).then(
      (results) => {
        this._pending -= reads.length
        reads.forEach(([name, , callback], i) => {
          const result = results[i]!
          deliver(
            callback,
            result.error !== undefined
              ? { error: new Error(result.error) }
              : { value: result[READ_RESULT_KEY[name]!] }
          )
        })
      },
      (error) => {
        this._pending -= reads.length
        reads.forEach(([, , callback]) => deliver(callback, { error }))
      }
    )
  }
}

export const makeDispatcher = (
  dbName: string,
  options: SqliteDispatcherOptions
): SqliteDispatcher => new SqliteNitroDispatcher(dbName, options)
