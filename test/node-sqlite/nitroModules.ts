// Test-only `react-native-nitro-modules` (jest moduleNameMapper): hands the real dispatcher
// (src/adapters/sqlite/makeDispatcher) a NodeDatabase factory instead of the native one.
import { NodeDatabase } from './NodeDatabase'

const hybridObjects: Record<string, unknown> = {
  DatabasePaths: { databaseDirectory: process.cwd() },
  NativeDatabaseFactory: {
    createDatabase: (path: string, usesExclusiveLocking: boolean) =>
      new NodeDatabase(path, usesExclusiveLocking),
  },
}

export const NitroModules = {
  createHybridObject: (name: string): unknown => hybridObjects[name],
}
