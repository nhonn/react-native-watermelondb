export { default as publishReplayLatestWhileConnected } from './publishReplayLatestWhileConnected'
export {
  // classes
  Observable,
  Subject,
  ReplaySubject,
  BehaviorSubject, // observables
  of,
  merge,
  multicast, // operators
  distinctUntilChanged,
  map,
  switchMap,
  startWith,
  catchError,
} from './__wmelonRxShim'
export type { ConnectableObservable } from './__wmelonRxShim'
