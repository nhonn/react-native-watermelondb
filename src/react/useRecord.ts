import { useCallback, useSyncExternalStore } from 'react'
import type Model from '../Model'

// Re-renders when the record changes or is deleted (read `record.syncStatus` to tell)
export default function useRecord<T extends Model>(record: T): T {
  // stable per record, so React doesn't resubscribe on every render
  const subscribe = useCallback(
    (cb: () => void) => record.experimentalSubscribe(cb),
    [record]
  )
  useSyncExternalStore(subscribe, () => record._version)
  return record
}
