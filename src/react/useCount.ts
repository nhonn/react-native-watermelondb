import { useMemo, useSyncExternalStore } from 'react'
import type Query from '../Query'
import sharedStore from './sharedStore'

export default function useCount(query: Query<any>): number {
  const store = useMemo(
    () =>
      sharedStore<number>(
        () => query._cachedCountThrottledSubscribable,
        (cb) => query.collection._fetchCount(query, cb),
        (a, b) => a === b,
        0
      ),
    // queries are usually rebuilt inline every render; key by description
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.collection, query._descriptionKey]
  )
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}
