export type SQLiteValue = string | number | boolean | null
export type RawRow = Record<string, SQLiteValue>
export type CachedRecord = string | Record<string, SQLiteValue> // string = id already cached in JS
export type FindResult = string | Record<string, SQLiteValue> | null
export type LocalValue = string | null
