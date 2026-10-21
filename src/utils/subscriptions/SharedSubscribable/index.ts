import type { Unsubscribe } from '../type'
import '../type'
import invariant from '../../common/invariant' // A subscribable that implements the equivalent of:
// multicast(() => new ReplaySubject(1)) |> refCount Rx operation
//
// In other words:
// - Upon subscription, the source subscribable is subscribed to,
//   and its notifications are passed to subscribers here.
// - Multiple subscribers only cause a single subscription of the source
// - When last subscriber unsubscribes, the source is unsubscribed
// - Upon subscription, the subscriber receives last value sent by source (if any)

export default class SharedSubscribable<T> {
  _source: (subscriber: (arg0: T) => void) => Unsubscribe
  _unsubscribeSource: Unsubscribe | null | undefined = null
  _subscribers: [(arg0: T) => void, any][] = []
  _didEmit: boolean = false
  _lastValue: T = null as any

  _onIdle: (() => void) | undefined

  constructor(
    source: (subscriber: (arg0: T) => void) => Unsubscribe,
    onIdle?: () => void
  ) {
    this._source = source
    this._onIdle = onIdle
  }

  subscribe(subscriber: (arg0: T) => void, debugInfo?: any): Unsubscribe {
    const entry: [typeof subscriber, any] = [subscriber, debugInfo]

    this._subscribers.push(entry)

    if (this._didEmit) {
      subscriber(this._lastValue)
    }

    if (this._subscribers.length === 1) {
      // TODO: What if this throws?
      this._unsubscribeSource = this._source((value) => this._notify(value))
    }

    return () => this._unsubscribe(entry)
  }

  _notify(value: T): void {
    invariant(
      this._subscribers.length,
      `SharedSubscribable's source emitted a value after it was unsubscribed from`
    )
    this._didEmit = true
    this._lastValue = value

    this._subscribers.forEach(([subscriber]) => {
      subscriber(value)
    })
  }

  _unsubscribe(entry: [(arg0: T) => void, any]): void {
    const idx = this._subscribers.indexOf(entry)

    if (idx !== -1) this._subscribers.splice(idx, 1)

    if (!this._subscribers.length) {
      const unsubscribe = this._unsubscribeSource
      this._unsubscribeSource = null
      this._didEmit = false
      if (unsubscribe) unsubscribe()
      this._onIdle?.()
    }
  }
}
