import { useMemo, useSyncExternalStore } from 'react'
import type Model from '../Model'

// Re-renders when the record changes or is deleted (read `record.syncStatus` to tell)
export default function useRecord<T extends Model>(record: T): T {
  const store = useMemo(() => {
    const version = { current: 0 }
    return {
      subscribe: (cb: () => void) =>
        record.experimentalSubscribe(() => {
          version.current += 1
          cb()
        }),
      getSnapshot: () => version.current,
    }
  }, [record])
  useSyncExternalStore(store.subscribe, store.getSnapshot)
  return record
}
