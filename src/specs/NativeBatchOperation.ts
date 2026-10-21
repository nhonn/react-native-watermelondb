import type { SQLiteValue } from './SQLiteValue'

export type BatchTable = string | null
// [cacheBehavior (-1 remove | 0 ignore | 1 add), table, sql, argBatches]; id is argBatch[0] when cacheBehavior != 0
export type NativeBatchOperation = [number, BatchTable, string, SQLiteValue[][]]
