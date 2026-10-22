// Test-only stand-in for the native C++ NativeDatabase, built on Node's `node:sqlite`.
// Mirrors cpp/core/DatabaseCore semantics (record cache, transactions, user_version checks).
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'

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
        db = new DatabaseSync(':memory:')
        sharedMemory.set(path, db)
      }
      this._db = db
    } else {
      this._db = new DatabaseSync(isMemory(path) ? ':memory:' : path)
    }
    return this._db
  }

  _rows(sql: string, args: Value[]): Row[] {
    return this._open()
      .prepare(sql)
      .all(...fixArgs(args))
      .map((row) => ({ ...row }) as Row)
  }

  _inTransaction(block: () => void): void {
    const db = this._open()
    db.exec('begin exclusive transaction')
    try {
      block()
      db.exec('commit transaction')
    } catch (error) {
      try {
        db.exec('rollback transaction')
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
    this._open().exec(`pragma user_version = ${version}`)
  }

  _resetWithSchema(schemaSql: string, version: number): void {
    const db = this._open()
    // drop everything (a shared in-memory db cannot be replaced, other connections use it)
    this._inTransaction(() => {
      const objects = this._rows(
        "select type, name from sqlite_master where name not like 'sqlite_%'",
        []
      )
      objects.forEach(({ type, name }) => {
        if (type === 'table') {
          db.exec(`drop table if exists "${name}"`)
        }
      })
    })
    this._cache.clear()
    this._inTransaction(() => {
      db.exec(schemaSql)
      this._setUserVersion(version)
    })
  }

  initialize(expectedVersion: number): InitializeResult {
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

  setUpWithSchema(schemaSql: string, schemaVersion: number): void {
    this._resetWithSchema(schemaSql, schemaVersion)
  }

  unsafeResetDatabase(schemaSql: string, schemaVersion: number): void {
    this._resetWithSchema(schemaSql, schemaVersion)
  }

  setUpWithMigrations(sql: string, fromVersion: number, toVersion: number): void {
    const v = this._userVersion()
    if (v !== fromVersion) {
      throw new Error(
        `Incompatible migration set applied. DB: ${v}, migration: ${fromVersion}`
      )
    }
    this._inTransaction(() => {
      this._open().exec(sql)
      this._setUserVersion(toVersion)
    })
  }

  forget(table: string, ids: string[]): void {
    ids.forEach((id) => this._cache.delete(`${table}$${id}`))
  }

  find(table: string, id: string): string | Row | null {
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

  query(table: string, sql: string, args: Value[]): (string | Row)[] {
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

  queryIds(sql: string, args: Value[]): string[] {
    return this._rows(sql, args).map((row) => String(row.id))
  }

  unsafeQueryRaw(sql: string, args: Value[]): Row[] {
    return this._rows(sql, args)
  }

  count(sql: string, args: Value[]): number {
    const row = this._rows(sql, args)[0]
    if (!row || row.count === undefined) {
      throw new Error('Invalid count query, can`t find `count` column')
    }
    return Number(row.count)
  }

  batch(operations: Op[]): void {
    const added: string[] = []
    const removed: string[] = []
    const db = this._open()
    this._inTransaction(() => {
      operations.forEach(([cacheBehavior, table, sql, argBatches]) => {
        const stmt = db.prepare(sql)
        argBatches.forEach((args) => {
          stmt.run(...fixArgs(args))
          if (cacheBehavior !== 0) {
            const key = `${table}$${args[0]}`
              ; (cacheBehavior === 1 ? added : removed).push(key)
          }
        })
      })
    })
    added.forEach((k) => this._cache.add(k))
    removed.forEach((k) => this._cache.delete(k))
  }

  getLocal(key: string): string | null {
    const row = this._rows('select value from local_storage where key = ?', [
      key,
    ])[0]
    return row ? (row.value as string) : null
  }

  unsafeExecuteMultiple(sql: string): void {
    this._open().exec(sql)
  }
}
