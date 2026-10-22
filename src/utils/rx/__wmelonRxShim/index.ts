// NOTE: All Rx imports in WatermelonDB MUST go through this file
// this is a magic shim that can be replaced via babel onto another shim that imports Rx files
// from different locations
// This allows manual tree shaking on React Native
export {
  // classes
  Observable,
  Subject,
  ReplaySubject,
  BehaviorSubject, // observables
  of,
  merge,
} from 'rxjs'
export {
  // operators
  multicast,
  distinctUntilChanged,
  map,
  switchMap,
  startWith,
  catchError,
} from 'rxjs/operators'
export type { ConnectableObservable } from 'rxjs'
