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
// One-row `::watermelondb::FoundRecord`, converted straight to the record object.
export type FoundRecord = CustomType<
  Record<string, SQLiteValue>,
  '::watermelondb::FoundRecord',
  { include: 'RecordSetJSI.hpp' }
>
export type FindResult = string | FoundRecord | null // string = id already cached in JS
export type LocalValue = string | null
