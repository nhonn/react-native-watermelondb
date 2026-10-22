import type { SharedSubscribable } from '../utils/subscriptions'
import type { ResultCallback } from '../utils/fp/Result'

export type SharedStore<T> = {
  subscribe: (onChange: () => void) => () => void
  getSnapshot: () => T
}

// External store for useSyncExternalStore on top of a shared (per-collection, per-query) subscribable
export default function sharedStore<T>(
  shared: () => SharedSubscribable<T>, // resolved at subscribe time so idle/recreated shareds are re-joined
  prefetch: (callback: ResultCallback<T>) => void,
  isEqual: (a: T, b: T) => boolean,
  initial: T
): SharedStore<T> {
  let value: { current: T } | null = null
  let onChange: (() => void) | null = null
  let prefetching = false

  const set = (next: T): void => {
    if (value && isEqual(value.current, next)) return
    value = { current: next }
    onChange?.()
  }

  return {
    subscribe(callback) {
      onChange = callback
      const unsubscribe = shared().subscribe(set)
      return () => {
        onChange = null
        unsubscribe()
      }
    },
    getSnapshot() {
      if (!value && !prefetching) {
        prefetching = true
        // sync adapters answer inside this call: first render already has data, no empty frame
        prefetch((result) => {
          if (!result.error) set(result.value)
        })
      }
      return value ? value.current : initial
    },
  }
}
