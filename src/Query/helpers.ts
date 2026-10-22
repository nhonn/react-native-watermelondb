import type { Class } from '../types'
import type Model from '../Model'
import invariant from '../utils/common/invariant'
import type Database from '../Database'
import type { QueryDescription, Where } from '../QueryDescription'
import type { TableName } from '../Schema'
import type { QueryAssociation } from './index'
export const getAssociations = (
  description: QueryDescription,
  modelClass: Class<Model>,
  db: Database
): QueryAssociation[] =>
  description.joinTables
    .map((table) => {
      const info = modelClass.associations[table]
      invariant(
        info,
        `Query on '${modelClass.table}' joins with '${table}', but ${modelClass.name} does not have associations={} defined for '${table}'`
      )
      return {
        from: modelClass.table,
        to: table,
        info,
      }
    })
    .concat(
      description.nestedJoinTables.map(({ from, to }) => {
        const collection = db.get(from)
        invariant(
          collection,
          `Query on '${modelClass.table}' has a nested join with '${from}', but collection for '${from}' cannot be found`
        )
        const info = collection.modelClass.associations[to]
        invariant(
          info,
          `Query on '${modelClass.table}' has a nested join from '${from}' to '${to}', but ${collection.modelClass.name} does not have associations={} defined for '${to}'`
        )
        return {
          from,
          to,
          info,
        }
      })
    )

export type QueryColumnDependencies = Map<TableName<any>, Set<string>>
// Columns (per table) that decide which records a query returns and in what order; null = unknown (raw SQL)
export const getColumnDependencies = (
  table: TableName<any>,
  description: QueryDescription,
  associations: QueryAssociation[]
): QueryColumnDependencies | null => {
  if (description.sql) return null
  const deps: QueryColumnDependencies = new Map()
  const add = (t: TableName<any>, column: string): void => {
    let set = deps.get(t)
    if (!set) {
      set = new Set(['_status'])
      deps.set(t, set)
    }
    set.add(column)
  }
  let unknown = false
  const walk = (t: TableName<any>, conditions: Where[]): void => {
    for (const where of conditions) {
      if (where.type === 'where') {
        add(t, where.left)
        if (where.comparison.right.column) add(t, where.comparison.right.column)
      } else if (where.type === 'and' || where.type === 'or') {
        walk(t, where.conditions)
      } else if (where.type === 'on') {
        walk(where.table, where.conditions)
      } else {
        unknown = true // Q.unsafeSqlExpr
      }
    }
  }
  walk(table, description.where)
  if (unknown) return null
  description.sortBy.forEach(({ sortColumn }) => add(table, sortColumn))
  associations.forEach(({ from, to, info }) => {
    if (info.type === 'belongs_to') {
      add(from, info.key)
      add(to, 'id')
    } else {
      add(to, info.foreignKey)
    }
  })
  ;[
    table,
    ...description.joinTables,
    ...description.nestedJoinTables.map((n) => n.to),
  ].forEach((t) => add(t, '_status'))
  return deps
}
