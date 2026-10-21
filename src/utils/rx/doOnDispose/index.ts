import { Observable } from '../__wmelonRxShim' // Performs an action when Observable is disposed; analogous to `Observable.do`

export default function doOnDispose<T>(
  onDispose: () => void
): (arg0: Observable<T>) => Observable<T> {
  return (source) =>
    Observable.create((observer: any) => {
      const subscription = source.subscribe(observer)
      return () => {
        subscription.unsubscribe()
        onDispose()
      }
    })
}