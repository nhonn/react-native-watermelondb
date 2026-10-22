import type {
  ResultCallback,
  SqliteDispatcher,
  SqliteDispatcherMethod,
  SqliteDispatcherOptions,
} from '../../src/adapters/sqlite/type'
import { NodeDatabase } from './NodeDatabase'

class NodeDispatcher implements SqliteDispatcher {
  _db: NodeDatabase

  _synchronous: boolean

  constructor(
    path: string,
    { usesExclusiveLocking, synchronous }: SqliteDispatcherOptions
  ) {
    this._db = new NodeDatabase(path, usesExclusiveLocking)
    this._synchronous = synchronous
  }

  callSync(name: SqliteDispatcherMethod, args: any[]): any {
    return (this._db[name] as (...a: any[]) => unknown)(...args)
  }

  call(
    name: SqliteDispatcherMethod,
    args: any[],
    callback: ResultCallback<any>
  ): void {
    const run = (): unknown =>
      (this._db[name] as (...a: any[]) => unknown)(...args)
    if (this._synchronous) {
      let value: unknown
      try {
        value = run()
      } catch (error: any) {
        callback({ error: new Error(error?.message) })
        return
      }
      callback({ value })
      return
    }
    Promise.resolve()
      .then(run)
      .then(
        (value) => callback({ value }),
        (error) => callback({ error: new Error(error?.message) })
      )
  }
}

export const makeDispatcher = (
  dbName: string,
  options: SqliteDispatcherOptions
): SqliteDispatcher => new NodeDispatcher(dbName, options)
