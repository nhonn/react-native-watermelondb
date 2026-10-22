import { logError } from '../../utils/common'
import type { Unsubscribe } from '../../utils/subscriptions'
import '../../utils/subscriptions'
import type Query from '../../Query'
import type Model from '../../Model'
import type { TableName } from '../../Schema'
import type { CollectionChangeSet } from '../../Collection'
import { encodeConditions, type Matcher } from '../encodeMatcher'
import canAffectQuery from '../canAffectQuery'
let isThrottlingDisabled = false
export function experimentalDisableObserveCountThrottling(): void {
  isThrottlingDisabled = true
}

const THROTTLE_MS = 250

// Produces a count subscription by re-counting when a change can affect the query.
// Throttled mode fires on the leading and trailing edge: the last change in a window is always counted.
export default function subscribeToCount<Record extends Model>(
  query: Query<Record>,
  isThrottled: boolean,
  subscriber: (arg0: number) => void
): Unsubscribe {
  const { collection, table, description } = query
  const throttled = isThrottled && !isThrottlingDisabled
  const dependencies = query._columnDependencies
  // created records can be matched in memory only when the count reads just the primary table
  let matcher: Matcher<Record> | null | undefined =
    query.secondaryTables.length || description.sql ? null : undefined
  let previousCount = -1
  let lastFetchAt = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let unsubscribed = false

  function fetchCount(): void {
    timer = null
    lastFetchAt = Date.now()
    collection._fetchCount(query, (result) => {
      if (result.error) {
        logError(result.error.toString())
        return
      }

      const count = result.value
      const shouldEmit = count !== previousCount && !unsubscribed
      previousCount = count
      if (shouldEmit) subscriber(count)
    })
  }

  function isRelevant(
    changes: [TableName<any>, CollectionChangeSet<any>][]
  ): boolean {
    return changes.some(([changedTable, changeSet]) =>
      changeSet.some((change) => {
        if (!canAffectQuery(dependencies, changedTable, change)) return false
        if (change.type !== 'created' || changedTable !== table) return true
        if (matcher === undefined) {
          try {
            matcher = encodeConditions(description.where) as any
          } catch {
            matcher = null
          }
        }
        return !matcher || matcher(change.record._raw)
      })
    )
  }

  const unsubscribe = collection.database.experimentalSubscribe(
    query.allTables,
    (changes) => {
      if (!isRelevant(changes)) return
      if (!throttled) return fetchCount()
      if (timer) return
      const wait = lastFetchAt + THROTTLE_MS - Date.now()
      if (wait <= 0) fetchCount()
      else timer = setTimeout(fetchCount, wait)
    },
    {
      name: 'subscribeToCount',
      query,
      subscriber,
    }
  )
  fetchCount()
  return () => {
    unsubscribed = true
    if (timer) clearTimeout(timer)
    unsubscribe()
  }
}
