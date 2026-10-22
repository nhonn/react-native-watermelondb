import type { CollectionChange } from '../Collection'
import type { TableName } from '../Schema'
import type { QueryColumnDependencies } from '../Query/helpers'

// False only for an update that touched none of the columns the query reads (filter, sort, join keys):
// it can't change which records match or their order
export default function canAffectQuery(
  dependencies: QueryColumnDependencies | null,
  table: TableName<any>,
  change: CollectionChange<any>
): boolean {
  const { changedColumns } = change
  const columns = dependencies?.get(table)
  if (change.type !== 'updated' || !changedColumns || !columns) return true
  for (const column of changedColumns) if (columns.has(column)) return true
  return false
}
