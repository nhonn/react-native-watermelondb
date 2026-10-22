import { useMemo, useSyncExternalStore } from 'react'
import type Model from '../Model'
import type Query from '../Query'
import identicalArrays from '../utils/fp/identicalArrays'
import sharedStore from './sharedStore'

// What async adapters return before the first result
const EMPTY: any[] = []

export default function useQuery<T extends Model>(query: Query<T>): T[] {
  const store = useMemo(
    () =>
      sharedStore<T[]>(
        () => query._cachedSubscribable,
        (cb) => query.collection._fetchQuery(query, cb),
        identicalArrays,
        EMPTY
      ),
    // queries are usually rebuilt inline every render; key by description
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.collection, query._descriptionKey]
  )
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}
