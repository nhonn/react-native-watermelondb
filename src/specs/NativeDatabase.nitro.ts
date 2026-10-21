import type { HybridObject } from 'react-native-nitro-modules'
import type { InitializeResult } from './InitializeResult'
import type { NativeBatchOperation } from './NativeBatchOperation'
import type {
  CachedRecord,
  FindResult,
  LocalValue,
  SQLiteValue,
} from './SQLiteValue'

export interface NativeDatabase
  extends HybridObject<{ ios: 'c++'; android: 'c++' }> {
  initialize(expectedVersion: number): Promise<InitializeResult>
  setUpWithSchema(schemaSql: string, schemaVersion: number): Promise<void>
  setUpWithMigrations(
    migrationSql: string,
    fromVersion: number,
    toVersion: number
  ): Promise<void>
  find(table: string, id: string): Promise<FindResult>
  query(
    table: string,
    sql: string,
    args: SQLiteValue[]
  ): Promise<CachedRecord[]>
  queryIds(sql: string, args: SQLiteValue[]): Promise<string[]>
  unsafeQueryRaw(sql: string, args: SQLiteValue[]): Promise<Record<string, SQLiteValue>[]>
  count(sql: string, args: SQLiteValue[]): Promise<number>
  batch(operations: NativeBatchOperation[]): Promise<void>
  getLocal(key: string): Promise<LocalValue>
  unsafeExecuteMultiple(sql: string): Promise<void>
  unsafeResetDatabase(schemaSql: string, schemaVersion: number): Promise<void>
  unsafeClose(): Promise<void>
}
