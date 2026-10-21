import type {
  ResultCallback,
  SqliteDispatcher,
  SqliteDispatcherMethod,
  SqliteDispatcherOptions,
} from '../../src/adapters/sqlite/type'
import { NodeDatabase } from './NodeDatabase'

class NodeDispatcher implements SqliteDispatcher {
  _db: NodeDatabase

  constructor(path: string, { usesExclusiveLocking }: SqliteDispatcherOptions) {
    this._db = new NodeDatabase(path, usesExclusiveLocking)
  }

  call(name: SqliteDispatcherMethod, args: any[], callback: ResultCallback<any>): void {
    ;(this._db[name] as (...a: any[]) => Promise<unknown>)(...args).then(
      (value) => callback({ value }),
      (error) => callback({ error: new Error(error?.message) })
    )
  }
}

export const makeDispatcher = (
  dbName: string,
  options: SqliteDispatcherOptions
): SqliteDispatcher => new NodeDispatcher(dbName, options)
