import { ensureDecoratorUsedProperly } from '../common'
import type { Options } from '../../Relation'
import Relation from '../../Relation'
import type Model from '../../Model'
import type { ColumnName, TableName } from '../../Schema'

// Defines a model property that fetches a record with a specific ID
// Returns an mutable Relation object
// - when the fetched record changes
// - when the record ID changes (new record must be fetched)
// - … or emits null whenever record ID is null
//
// If the record ID *can't* change, use `immutableRelation` for efficiency
//
// Property's setter assigns a new record (you pass the record, and the ID is set)
//
// relationIdColumn - name of the column with record ID
// relationTable - name of the table containing desired recods
//
// Example: a Task has a project it belongs to (and the project can change), so it may define:
//   @relation('project', 'project_id') project: Relation<Project>
const relation = (
  relationTable: TableName<any>,
  relationIdColumn: ColumnName,
  options?: Options | null
): ((target: any, key: string, descriptor?: any) => any) => (
  target: Record<string, any>,
  key: string,
  descriptor?: Record<string, any>
) => {
  ensureDecoratorUsedProperly(relationIdColumn, target, key, descriptor as any)
  return {
    get(this: any): Relation<Model> {
      const model = this
      model._relationCache = model._relationCache || {}
      const cachedRelation = model._relationCache[key]

      if (cachedRelation) {
        return cachedRelation
      }

      const newRelation: any = new Relation(
        model.asModel,
        relationTable,
        relationIdColumn,
        options || {
          isImmutable: false,
        }
      )
      model._relationCache[key] = newRelation
      return newRelation
    },

    set(): void {
      throw new Error(`Don't set relation directly. Use relation.set() instead`)
    },
  }
}

export default relation