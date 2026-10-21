import { makeDispatcher as makeNodeDispatcher } from '../node-sqlite/makeDispatcher'
import type {
  ResultCallback,
  SqliteDispatcherMethod,
} from '../../src/adapters/sqlite/type'

// upstream 0.28 passes dbName first to these; the fork's native API dropped it
const DROPS_DB_NAME = new Set(['initialize', 'setUpWithSchema', 'setUpWithMigrations'])

export const getDispatcherType = (): string => 'asynchronous'

export const makeDispatcher = (
  _type: string,
  _tag: number,
  dbName: string,
  options: { usesExclusiveLocking: boolean }
) => {
  const inner = makeNodeDispatcher(dbName, {
    usesExclusiveLocking: options.usesExclusiveLocking,
    synchronous: false,
  })
  return {
    call: (
      name: SqliteDispatcherMethod,
      args: any[],
      callback: ResultCallback<any>
    ): void =>
      inner.call(name, DROPS_DB_NAME.has(name) ? args.slice(1) : args, callback),
  }
}
