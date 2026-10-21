import { logError } from '../../utils/common'
import identicalArrays from '../../utils/fp/identicalArrays'
import type { Unsubscribe } from '../../utils/subscriptions'
import '../../utils/subscriptions'
import type Query from '../../Query'
import type Model from '../../Model'
import type { RecordId } from '../../Model'
import type { CollectionChangeSet } from '../../Collection'
import type { TableName } from '../../Schema'
import { encodeConditions, type Matcher } from '../encodeMatcher'
// Produces an observable version of a query by re-querying the database
// when any change occurs in any of the relevant Stores.
// This is inefficient for simple queries, but necessary for complex queries

export default function subscribeToQueryReloading<Record extends Model>(
  query: Query<Record>,
  subscriber: (arg0: Record[]) => void, // Emits `false` when query fetch begins + always emits even if no change - internal trick needed
  // by observeWithColumns
  shouldEmitStatus: boolean = false
): Unsubscribe {
  const { collection, table, description } = query
  // with skip, a removed record before the window shifts it, and the previous match state is unknown because models mutate in place
  const canSkipReloads =
    !description.joinTables.length &&
    !description.nestedJoinTables.length &&
    !description.skip &&
    !description.sql
  let matcher: Matcher<Record> | null | undefined
  let previousIds: Set<RecordId> | null = null
  let pendingFetches = 0
  let previousRecords: Record[] | null | undefined = null
  let unsubscribed = false

  function reloadingObserverFetch(): void {
    if (shouldEmitStatus) {
      if (!unsubscribed) subscriber(false as any)
    }

    pendingFetches += 1
    collection._fetchQuery(query, (result) => {
      pendingFetches -= 1
      if (result.error) {
        logError(result.error.toString())
        return
      }

      const records = result.value
      const shouldEmit =
        !unsubscribed &&
        (shouldEmitStatus ||
          !previousRecords ||
          !identicalArrays(records, previousRecords))
      previousRecords = records
      previousIds = null
      if (shouldEmit) subscriber(records)
    })
  }

  function isRelevant(
    changes: [TableName<any>, CollectionChangeSet<any>][]
  ): boolean {
    if (!canSkipReloads || pendingFetches > 0 || !previousRecords) return true
    if (matcher === undefined) {
      try {
        matcher = encodeConditions(description.where) as any
      } catch {
        matcher = null
      }
    }
    if (!matcher) return true
    const ids = (previousIds ??= new Set(previousRecords.map((r) => r.id)))
    return changes.some(
      ([changedTable, changeSet]) =>
        changedTable === table &&
        changeSet.some(
          ({ record, type }) =>
            ids.has(record.id) ||
            (type !== 'destroyed' && matcher!(record._raw))
        )
    )
  }

  const unsubscribe = collection.database.experimentalSubscribe(
    query.allTables,
    (changes) => {
      if (isRelevant(changes)) reloadingObserverFetch()
    },
    {
      name: 'subscribeToQueryReloading observation',
      query,
      subscriber,
    }
  )
  reloadingObserverFetch()
  return () => {
    unsubscribed = true
    unsubscribe()
  }
}
