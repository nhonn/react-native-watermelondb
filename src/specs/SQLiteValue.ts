import type { CustomType } from 'react-native-nitro-modules'

export type SQLiteValue = string | number | boolean | null
export type RawRow = Record<string, SQLiteValue>
export type CachedRecord = string | Record<string, SQLiteValue> // string = id already cached in JS

// Native side builds these as one shared columnar `::watermelondb::RecordSet` (converted to JS rows without copies).
export type CachedRecords = CustomType<
  CachedRecord[],
  '::watermelondb::RecordSet',
  { include: 'RecordSetJSI.hpp' }
>
export type RawRows = CustomType<
  RawRow[],
  '::watermelondb::RecordSet',
  { include: 'RecordSetJSI.hpp' }
>
export type FindResult = string | Record<string, SQLiteValue> | null
export type LocalValue = string | null
