// Test-only stand-in for the native C++ NativeDatabase, built on Node's `node:sqlite`.
// Mirrors cpp/core/DatabaseCore semantics (record cache, transactions, user_version checks) and the
// NativeDatabase surface: async methods, `*Sync` methods, `readMany`, `forget`.
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'
import type {
  NativeReadCall,
  NativeReadResult,
} from '../../src/specs/NativeReadCall'

// `node:sqlite` is a prefix-only builtin that Jest 29 cannot resolve through `require`.
const { DatabaseSync } = process.getBuiltinModule(
  'node:sqlite'
) as typeof import('node:sqlite')

type Value = string | number | boolean | null
type Row = Record<string, Value>
type Op = [number, string | null | undefined, string, Value[][]]
type InitializeResult = {
  code: 'ok' | 'schema_needed' | 'migrations_needed'
  databaseVersion?: number
}

// emulates `cache=shared` in-memory databases: same path => same instance
const sharedMemory = new Map<string, DatabaseSyncType>()

const isMemory = (path: string): boolean =>
  path === ':memory:' || path.includes('mode=memory')

const fixArgs = (args: Value[]): (string | number | null)[] =>
  args.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v))

// node:sqlite errors come from another realm, so `instanceof Error` fails in the Jest sandbox
const guard = <T>(block: () => T): T => {
  try {
    return block()
  } catch (error: any) {
    throw new Error(error?.message)
  }
}

export class NodeDatabase {
  _path: string

  _db: DatabaseSyncType | undefined

  _cache = new Set<string>()

  constructor(path: string, _usesExclusiveLocking: boolean) {
    this._path = path
  }

  _open(): DatabaseSyncType {
    if (this._db) {
      return this._db
    }
    const path = this._path
    const shared = path.includes('mode=memory') && path.includes('cache=shared')
    if (shared) {
      let db = sharedMemory.get(path)
      if (!db) {
        db = guard(() => new DatabaseSync(':memory:'))
        sharedMemory.set(path, db)
      }
      this._db = db
    } else {
      this._db = guard(
        () => new DatabaseSync(isMemory(path) ? ':memory:' : path)
      )
    }
    return this._db
  }

  _exec(sql: string): void {
    const db = this._open()
    guard(() => db.exec(sql))
  }

  _rows(sql: string, args: Value[]): Row[] {
    const db = this._open()
    return guard(() =>
      db
        .prepare(sql)
        .all(...fixArgs(args))
        .map((row) => ({ ...row }) as Row)
    )
  }

  _inTransaction(block: () => void): void {
    this._exec('begin exclusive transaction')
    try {
      block()
      this._exec('commit transaction')
    } catch (error) {
      try {
        this._exec('rollback transaction')
      } catch {
        // ignore secondary failure
      }
      throw error
    }
  }

  _userVersion(): number {
    return Number(this._rows('pragma user_version', [])[0]?.user_version)
  }

  _setUserVersion(version: number): void {
    this._exec(`pragma user_version = ${version}`)
  }

  _resetWithSchema(schemaSql: string, version: number): void {
    // drop everything (a shared in-memory db cannot be replaced, other connections use it)
    this._inTransaction(() => {
      const objects = this._rows(
        "select type, name from sqlite_master where name not like 'sqlite_%'",
        []
      )
      objects.forEach(({ type, name }) => {
        if (type === 'table') {
          this._exec(`drop table if exists "${name}"`)
        }
      })
    })
    this._cache.clear()
    this._inTransaction(() => {
      this._exec(schemaSql)
      this._setUserVersion(version)
    })
  }

  initializeSync(expectedVersion: number): InitializeResult {
    this._open()
    const v = this._userVersion()
    if (v === expectedVersion) {
      return { code: 'ok' }
    }
    if (v > 0 && v < expectedVersion) {
      return { code: 'migrations_needed', databaseVersion: v }
    }
    return { code: 'schema_needed' }
  }

  setUpWithSchemaSync(schemaSql: string, schemaVersion: number): void {
    this._resetWithSchema(schemaSql, schemaVersion)
  }

  unsafeResetDatabaseSync(schemaSql: string, schemaVersion: number): void {
    this._resetWithSchema(schemaSql, schemaVersion)
  }

  setUpWithMigrationsSync(
    sql: string,
    fromVersion: number,
    toVersion: number
  ): void {
    const v = this._userVersion()
    if (v !== fromVersion) {
      throw new Error(
        `Incompatible migration set applied. DB: ${v}, migration: ${fromVersion}`
      )
    }
    this._inTransaction(() => {
      this._exec(sql)
      this._setUserVersion(toVersion)
    })
  }

  forgetSync(table: string, ids: string[]): void {
    ids.forEach((id) => this._cache.delete(`${table}$${id}`))
  }

  findSync(table: string, id: string): string | Row | null {
    const key = `${table}$${id}`
    if (this._cache.has(key)) {
      return id
    }
    const rows = this._rows(`select * from "${table}" where id == ? limit 1`, [
      id,
    ])
    if (!rows[0]) {
      return null
    }
    this._cache.add(key)
    return rows[0]
  }

  querySync(table: string, sql: string, args: Value[]): (string | Row)[] {
    return this._rows(sql, args).map((row) => {
      const id = String(row.id)
      const key = `${table}$${id}`
      if (this._cache.has(key)) {
        return id
      }
      this._cache.add(key)
      return row
    })
  }

  queryIdsSync(sql: string, args: Value[]): string[] {
    return this._rows(sql, args).map((row) => String(row.id))
  }

  unsafeQueryRawSync(sql: string, args: Value[]): Row[] {
    return this._rows(sql, args)
  }

  countSync(sql: string, args: Value[]): number {
    const row = this._rows(sql, args)[0]
    if (!row || row.count === undefined) {
      throw new Error('Invalid count query, can`t find `count` column')
    }
    return Number(row.count)
  }

  batchSync(operations: Op[]): void {
    const added: string[] = []
    const removed: string[] = []
    const db = this._open()
    this._inTransaction(() => {
      operations.forEach(([cacheBehavior, table, sql, argBatches]) => {
        const stmt = guard(() => db.prepare(sql))
        argBatches.forEach((args) => {
          guard(() => stmt.run(...fixArgs(args)))
          if (cacheBehavior !== 0) {
            const key = `${table}$${args[0]}`
            ;(cacheBehavior === 1 ? added : removed).push(key)
          }
        })
      })
    })
    added.forEach((k) => this._cache.add(k))
    removed.forEach((k) => this._cache.delete(k))
  }

  getLocalSync(key: string): string | null {
    const row = this._rows('select value from local_storage where key = ?', [
      key,
    ])[0]
    return row ? (row.value as string) : null
  }

  unsafeExecuteMultipleSync(sql: string): void {
    this._exec(sql)
  }

  // Async variants: the native side runs these on a serial queue; here they run in call order
  // and settle through a Promise (a throw becomes a rejection, like on the native side).
  async initialize(expectedVersion: number): Promise<InitializeResult> {
    return this.initializeSync(expectedVersion)
  }

  async setUpWithSchema(
    schemaSql: string,
    schemaVersion: number
  ): Promise<void> {
    this.setUpWithSchemaSync(schemaSql, schemaVersion)
  }

  async setUpWithMigrations(
    sql: string,
    fromVersion: number,
    toVersion: number
  ): Promise<void> {
    this.setUpWithMigrationsSync(sql, fromVersion, toVersion)
  }

  async forget(table: string, ids: string[]): Promise<void> {
    this.forgetSync(table, ids)
  }

  async find(table: string, id: string): Promise<string | Row | null> {
    return this.findSync(table, id)
  }

  async query(
    table: string,
    sql: string,
    args: Value[]
  ): Promise<(string | Row)[]> {
    return this.querySync(table, sql, args)
  }

  async queryIds(sql: string, args: Value[]): Promise<string[]> {
    return this.queryIdsSync(sql, args)
  }

  async unsafeQueryRaw(sql: string, args: Value[]): Promise<Row[]> {
    return this.unsafeQueryRawSync(sql, args)
  }

  async count(sql: string, args: Value[]): Promise<number> {
    return this.countSync(sql, args)
  }

  async batch(operations: Op[]): Promise<void> {
    this.batchSync(operations)
  }

  async getLocal(key: string): Promise<string | null> {
    return this.getLocalSync(key)
  }

  async unsafeExecuteMultiple(sql: string): Promise<void> {
    this.unsafeExecuteMultipleSync(sql)
  }

  async unsafeResetDatabase(
    schemaSql: string,
    schemaVersion: number
  ): Promise<void> {
    this.unsafeResetDatabaseSync(schemaSql, schemaVersion)
  }

  // each call fails independently (result.error)
  async readMany(calls: NativeReadCall[]): Promise<NativeReadResult[]> {
    return calls.map((call) => {
      try {
        return this._read(call)
      } catch (error: any) {
        return { error: String(error?.message) }
      }
    })
  }

  _read({ method, table, sql, args }: NativeReadCall): NativeReadResult {
    switch (method) {
      case 'find':
        return { find: this.findSync(table, args[0] as string) }
      case 'query':
        return { records: this.querySync(table, sql, args) }
      case 'queryIds':
        return { ids: this.queryIdsSync(sql, args) }
      case 'unsafeQueryRaw':
        return { records: this.unsafeQueryRawSync(sql, args) }
      case 'count':
        return { count: this.countSync(sql, args) }
      case 'getLocal':
        return { local: this.getLocalSync(args[0] as string) }
    }
  }
}
