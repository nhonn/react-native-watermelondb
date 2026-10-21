import type {
  CachedRecords,
  FindResult,
  LocalValue,
  SQLiteValue,
} from './SQLiteValue'

export type NativeReadMethod =
  | 'find'
  | 'query'
  | 'queryIds'
  | 'unsafeQueryRaw'
  | 'count'
  | 'getLocal'

// find: table + args[0] = id; getLocal: args[0] = key; query: table + sql + args; others: sql + args
export interface NativeReadCall {
  method: NativeReadMethod
  table: string
  sql: string
  args: SQLiteValue[]
}

// Exactly one of the fields is set: `error`, or the one matching the call's method (records: query/unsafeQueryRaw)
export interface NativeReadResult {
  error?: string
  find?: FindResult
  records?: CachedRecords
  ids?: string[]
  count?: number
  local?: LocalValue
}
