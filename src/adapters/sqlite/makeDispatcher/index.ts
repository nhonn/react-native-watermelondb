import { NitroModules } from 'react-native-nitro-modules'
import type { DatabasePaths } from '../../../specs/DatabasePaths.nitro'
import type { NativeDatabase } from '../../../specs/NativeDatabase.nitro'
import type { NativeDatabaseFactory } from '../../../specs/NativeDatabaseFactory.nitro'
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

class SqliteNitroDispatcher implements SqliteDispatcher {
  _db: NativeDatabase

  constructor(dbName: string, { usesExclusiveLocking }: SqliteDispatcherOptions) {
    this._db = factory.createDatabase(
      resolveDatabasePath(dbName),
      usesExclusiveLocking
    )
  }

  call(
    name: SqliteDispatcherMethod,
    args: any[],
    callback: ResultCallback<any>
  ): void {
    // method call (not a detached reference) keeps `this` bound for Nitro
    ;(this._db[name] as (...a: any[]) => Promise<unknown>)
      .apply(this._db, args)
      .then(
        (value) => callback({ value }),
        (error) => callback({ error })
      )
  }
}

export const makeDispatcher = (
  dbName: string,
  options: SqliteDispatcherOptions
): SqliteDispatcher => new SqliteNitroDispatcher(dbName, options)
