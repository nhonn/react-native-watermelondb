/* eslint-disable no-use-before-define */
import type { $RE } from '../types'
import type { TableName, ColumnName } from '../Schema'
import '../Schema'
export type NonNullValue = number | string | boolean
export type NonNullValues = number[] | string[] | boolean[]
export type Value = NonNullValue | null
export type CompoundValue = Value | Value[]
export type Operator =
  | 'eq'
  | 'notEq'
  | 'gt'
  | 'gte'
  | 'weakGt'
  | 'lt'
  | 'lte'
  | 'oneOf'
  | 'notIn'
  | 'between'
  | 'like'
  | 'notLike'
  | 'includes'
export type ColumnDescription = $RE<{
  column: ColumnName
  type?: any
}>
// NOTE: other members are `undefined` so that all of them can be read without narrowing (as Flow allowed)
export type ComparisonRight =
  | $RE<{
      value: Value
      values?: undefined
      column?: undefined
    }>
  | $RE<{
      values: NonNullValues
      value?: undefined
      column?: undefined
    }>
  | $RE<{
      column: ColumnName
      type?: any
      value?: undefined
      values?: undefined
    }>
export type Comparison = $RE<{
  operator: Operator
  right: ComparisonRight
  type?: any
}>
export type WhereDescription = $RE<{
  type: 'where'
  left: ColumnName
  comparison: Comparison
}>
export type SqlExpr = $RE<{
  type: 'sql'
  expr: string
}>
export type Where = WhereDescription | And | Or | On | SqlExpr
export type And = $RE<{
  type: 'and'
  conditions: Where[]
}>
export type Or = $RE<{
  type: 'or'
  conditions: Where[]
}>
export type On = $RE<{
  type: 'on'
  table: TableName<any>
  conditions: Where[]
}>
export type SortOrder = 'asc' | 'desc'
export type SortBy = $RE<{
  type: 'sortBy'
  sortColumn: ColumnName
  sortOrder: SortOrder
}>
export type Take = $RE<{
  type: 'take'
  count: number
}>
export type Skip = $RE<{
  type: 'skip'
  count: number
}>
export type JoinTables = $RE<{
  type: 'joinTables'
  tables: TableName<any>[]
}>
export type NestedJoinTable = $RE<{
  type: 'nestedJoinTable'
  from: TableName<any>
  to: TableName<any>
}>
export type SqlQuery = $RE<{
  type: 'sqlQuery'
  sql: string
  values: Value[]
}>
export type Clause =
  | Where
  | SortBy
  | Take
  | Skip
  | JoinTables
  | NestedJoinTable
  | SqlQuery
type NestedJoinTableDef = $RE<{
  from: TableName<any>
  to: TableName<any>
}>
export type QueryDescription = $RE<{
  where: Where[]
  joinTables: TableName<any>[]
  nestedJoinTables: NestedJoinTableDef[]
  sortBy: SortBy[]
  take?: number
  skip?: number
  sql?: SqlQuery
}>
