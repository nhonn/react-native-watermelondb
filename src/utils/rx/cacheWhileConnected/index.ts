import type { ConnectableObservable, Observable } from '../__wmelonRxShim'
import { distinctUntilChanged } from '../__wmelonRxShim'
import publishReplayLatestWhileConnected from '../publishReplayLatestWhileConnected'

// Equivalent to observable |> distinctUntilChanged |> publishReplayLatestWhileConnected |> refCount
//
// Creates an observable that shares the connection with and replays the latest value from the underlying
// observable, and skips emissions that are the same as the previous one
export default function cacheWhileConnected<T>(
  source: Observable<T>
): Observable<T> {
  const connectable = source.pipe(
    distinctUntilChanged<T>(),
    publishReplayLatestWhileConnected<T>
  ) as ConnectableObservable<T>
  return connectable.refCount()
}
