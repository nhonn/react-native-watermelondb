import type { HybridObject } from 'react-native-nitro-modules'
import type { InitializeResult } from './InitializeResult'
import type { NativeBatchOperation } from './NativeBatchOperation'
import type {
  CachedRecords,
  FindResult,
  LocalValue,
  RawRows,
  SQLiteValue,
} from './SQLiteValue'

export interface NativeDatabase extends HybridObject<{
  ios: 'c++'
  android: 'c++'
}> {
  initialize(expectedVersion: number): Promise<InitializeResult>
  setUpWithSchema(schemaSql: string, schemaVersion: number): Promise<void>
  setUpWithMigrations(
    migrationSql: string,
    fromVersion: number,
    toVersion: number
  ): Promise<void>
  find(table: string, id: string): Promise<FindResult>
  query(table: string, sql: string, args: SQLiteValue[]): Promise<CachedRecords>
  queryIds(sql: string, args: SQLiteValue[]): Promise<string[]>
  unsafeQueryRaw(sql: string, args: SQLiteValue[]): Promise<RawRows>
  count(sql: string, args: SQLiteValue[]): Promise<number>
  batch(operations: NativeBatchOperation[]): Promise<void>
  getLocal(key: string): Promise<LocalValue>
  unsafeExecuteMultiple(sql: string): Promise<void>
  unsafeResetDatabase(schemaSql: string, schemaVersion: number): Promise<void>
  unsafeClose(): Promise<void>

  // Synchronous variants (one per async method, except unsafeClose); run on the calling (JS) thread.
  initializeSync(expectedVersion: number): InitializeResult
  setUpWithSchemaSync(schemaSql: string, schemaVersion: number): void
  setUpWithMigrationsSync(
    migrationSql: string,
    fromVersion: number,
    toVersion: number
  ): void
  findSync(table: string, id: string): FindResult
  querySync(table: string, sql: string, args: SQLiteValue[]): CachedRecords
  queryIdsSync(sql: string, args: SQLiteValue[]): string[]
  unsafeQueryRawSync(sql: string, args: SQLiteValue[]): RawRows
  countSync(sql: string, args: SQLiteValue[]): number
  batchSync(operations: NativeBatchOperation[]): void
  getLocalSync(key: string): LocalValue
  unsafeExecuteMultipleSync(sql: string): void
  unsafeResetDatabaseSync(schemaSql: string, schemaVersion: number): void
}
