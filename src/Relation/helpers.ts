import type { Observable } from '../utils/rx'
import {
  of as of$,
  map as map$,
  switchMap,
  distinctUntilChanged,
} from '../utils/rx'
import type Relation from './index'
import type Model from '../Model'

const getImmutableObservable = <T extends Model | null | undefined>(
  relation: Relation<T>
): Observable<T> =>
  relation._model.collections
    .get(relation._relationTableName) // $FlowFixMe
    .findAndObserve(relation.id as string) as any

const getObservable = <T extends Model | null | undefined>(
  relation: Relation<T>
): Observable<T> =>
  relation._model
    .observe() // $FlowFixMe
    .pipe(
      map$((model) => model._getRaw(relation._columnName) as string),
      distinctUntilChanged(),
      switchMap((id): Observable<any> =>
        id
          ? relation._model.collections
              .get(relation._relationTableName)
              .findAndObserve(id)
          : of$(null)
      )
    )

// eslint-disable-next-line
export const createObservable = <T extends Model | null | undefined>(
  relation: Relation<T>
): Observable<T> =>
  relation._isImmutable
    ? getImmutableObservable(relation)
    : getObservable(relation)
