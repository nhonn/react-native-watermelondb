import type { Class } from '../types'

/* eslint-disable no-use-before-define */
import allPromises from '../utils/fp/allPromises'
import invariant from '../utils/common/invariant'
import { Observable } from '../utils/rx'
import { toPromise } from '../utils/fp/Result'
import {
 fromArrayOrSpread, // eslint-disable-next-line no-unused-vars
} from '../utils/fp'
import type { Unsubscribe } from '../utils/subscriptions'
import { SharedSubscribable } from '../utils/subscriptions'
import subscribeToCount from '../observation/subscribeToCount'
import subscribeToQuery from '../observation/subscribeToQuery'
import subscribeToQueryWithColumns from '../observation/subscribeToQueryWithColumns'
import * as Q from '../QueryDescription'
import type { Clause, QueryDescription } from '../QueryDescription'
import type { default as Model, AssociationInfo, RecordId } from '../Model'
import type Collection from '../Collection'
import type { TableName, ColumnName } from '../Schema'
import {
 getAssociations,
 getColumnDependencies,
 type QueryColumnDependencies,
} from './helpers'
export type QueryAssociation = {
 from: TableName<any>
 to: TableName<any>
 info: AssociationInfo
}
export type SerializedQuery = {
 table: TableName<any>
 description: QueryDescription
 associations: QueryAssociation[]
}
// JSON maps NaN/±Infinity to null, so tag them to keep keys injective
const descriptionKeyReplacer = (_key: string, value: unknown): unknown =>
 typeof value === 'number' && !Number.isFinite(value)
  ? { nonFinite: String(value) }
  : value
interface QueryCountProxy {
 then<U>(
  onFulfill?: (value: number) => Promise<U> | U,
  onReject?: (error: any) => Promise<U> | U
 ): Promise<U>
}
export default class Query<Record extends Model> {
 // Used by withObservables to differentiate between object types
 static _wmelonTag: string = 'query'

 /**
  * Collection associated with this query
  */
 collection: Collection<Record>
 // TODO: Should this be public API? QueryDescription structure changes quite a bit...
 description: QueryDescription
 _rawDescription: QueryDescription
 private _descriptionKeyCache?: string
 get _descriptionKey(): string {
  return (this._descriptionKeyCache ??= JSON.stringify(
   this.description,
   descriptionKeyReplacer
  ))
 }

 get _cachedSubscribable(): SharedSubscribable<Record[]> {
  return this.collection._getSharedSubscribable(
   `query ${this._descriptionKey}`,
   (subscriber) => subscribeToQuery(this, subscriber)
  )
 }

 get _cachedCountSubscribable(): SharedSubscribable<number> {
  return this.collection._getSharedSubscribable(
   `count ${this._descriptionKey}`,
   (subscriber) => subscribeToCount(this, false, subscriber)
  )
 }

 get _cachedCountThrottledSubscribable(): SharedSubscribable<number> {
  return this.collection._getSharedSubscribable(
   `countThrottled ${this._descriptionKey}`,
   (subscriber) => subscribeToCount(this, true, subscriber)
  )
 }

 // Note: Don't use this directly, use Collection.query(...)
 constructor(collection: Collection<Record>, clauses: Clause[]) {
  this.collection = collection
  this._rawDescription = Q.buildQueryDescription(clauses)
  this.description = Q.queryWithoutDeleted(this._rawDescription)
 }

 /**
  * Returns a new Query that contains all clauses (conditions, sorting, etc.) from this Query
  * as well as the ones passed as arguments.
  *
  * You can pass conditions as multiple arguments or a single array.
  */
 extend(...clauses: Clause[]): Query<Record>
 extend(clauses: Clause[]): Query<Record>
 extend(...args: any[]): Query<Record> {
  const clauses = fromArrayOrSpread<Clause>(
   args,
   'Collection.query',
   'Clause'
  )
  const { collection } = this
  const { where, sortBy, take, skip, joinTables, nestedJoinTables, sql } =
   this._rawDescription
  invariant(!sql, 'Cannot extend an unsafe SQL query')
  // TODO: Move this & tests to QueryDescription
  return new Query(collection, [
   Q.experimentalJoinTables(joinTables),
   ...nestedJoinTables.map(({ from, to }) =>
    Q.experimentalNestedJoin(from, to)
   ),
   ...where,
   ...sortBy,
   ...(take ? [Q.take(take)] : []),
   ...(skip ? [Q.skip(skip)] : []),
   ...clauses,
  ])
 }

 /**
  * `query.pipe(fn)` is a FP convenience for `fn(query)`
  */
 pipe<T>(transform: (arg: this) => T): T {
  return transform(this)
 }

 /**
  * Fetches the list of records matching this query
  *
  * Tip: For convenience, you can also use `await query`
  */
 fetch(): Promise<Record[]> {
  return toPromise((callback) => this.collection._fetchQuery(this, callback))
 }

 // `await query` is public API
 // oxlint-disable-next-line unicorn/no-thenable
 then<U>(
  onFulfill?: (value: Record[]) => Promise<U> | U,
  onReject?: (error: any) => Promise<U> | U
 ): Promise<U> {
  // $FlowFixMe
  return this.fetch().then(onFulfill, onReject)
 }

 /**
  * Returns an `Rx.Observable` that tracks the list of records matching this query
  *
  * Tip: When using `withObservables`, you can simply pass the query without calling `.observe()`
  *
  * Warning: Changes to individual records in the array are NOT observed. Use `observeWithColumns`
  */
 observe(): Observable<Record[]> {
  return Observable.create((observer: any) =>
   this._cachedSubscribable.subscribe((records) => {
    observer.next(records)
   })
  )
 }

 /**
  * Same as {@link Query#observe}, but also emits when any of the records on the list
  * has one of its `columnNames` changed.
  */
 observeWithColumns(columnNames: ColumnName[]): Observable<Record[]> {
  return Observable.create((observer: any) =>
   this.experimentalSubscribeWithColumns(columnNames, (records) => {
    observer.next(records)
   })
  )
 }

 /**
  * Fetches the number of records matching this query
  *
  * Tip: For convenience you can also use `await query.count`
  */
 fetchCount(): Promise<number> {
  return toPromise((callback) => this.collection._fetchCount(this, callback))
 }

 get count(): QueryCountProxy {
  return {
   // `await query.count` is public API
   // oxlint-disable-next-line unicorn/no-thenable
   then: <U>(
    onFulfill?: (value: number) => Promise<U> | U,
    onReject?: (error: any) => Promise<U> | U
   ): Promise<U> => this.fetchCount().then(onFulfill, onReject),
  }
 }

 /**
  * Returns an `Rx.Observable` that tracks the number of matching records
  *
  * Note: By default, the count is throttled. Pass `false` to opt out of throttling.
  */
 observeCount(isThrottled: boolean = true): Observable<number> {
  return Observable.create((observer: any) => {
   const subscribable = isThrottled
    ? this._cachedCountThrottledSubscribable
    : this._cachedCountSubscribable
   return subscribable.subscribe((count) => {
    observer.next(count)
   })
  })
 }

 /**
  * Fetches the list of IDs of records matching this query
  *
  * Note: This is faster than using `fetch()` if you only need IDs
  */
 fetchIds(): Promise<RecordId[]> {
  return toPromise((callback) => this.collection._fetchIds(this, callback))
 }

 /**
  * Fetches an array of raw results of this query from the database.
  * These are plain JavaScript types and objects, not `Model` instances
  *
  * Warning: You MUST NOT mutate these objects, this can corrupt the database!
  *
  * This is useful as a performance optimization or for running non-standard raw queries
  * (e.g. pragmas, statistics, groupped results, records with extra columns, etc...)
  */
 unsafeFetchRaw(): Promise<any[]> {
  return toPromise((callback) =>
   this.collection._unsafeFetchRaw(this, callback)
  )
 }

 /**
  * Rx-free equivalent of `.observe()`
  */
 experimentalSubscribe(subscriber: (arg0: Record[]) => void): Unsubscribe {
  return this._cachedSubscribable.subscribe(subscriber)
 }

 /**
  * Rx-free equivalent of `.observeWithColumns()`
  */
 experimentalSubscribeWithColumns(
  columnNames: ColumnName[],
  subscriber: (arg0: Record[]) => void
 ): Unsubscribe {
  return subscribeToQueryWithColumns(this, columnNames, subscriber)
 }

 /**
  * Rx-free equivalent of `.observeCount()`
  */
 experimentalSubscribeToCount(
  subscriber: (arg0: number) => void
 ): Unsubscribe {
  return this._cachedCountSubscribable.subscribe(subscriber)
 }

 /**
  * Marks all records matching this query as deleted (they will be deleted permenantly after sync)
  *
  * Note: This method must be called within a Writer {@link Database#write}.
  *
  * @see {Model#markAsDeleted}
  */
 async markAllAsDeleted(): Promise<void> {
  const records = await this.fetch()
  await allPromises((record) => record.markAsDeleted(), records)
 }

 /**
  * Permanently deletes all records matching this query
  *
  * Note: Do not use this when using Sync, as deletion will not be synced.
  *
  * Note: This method must be called within a Writer {@link Database#write}.
  *
  * @see {Model#destroyPermanently}
  */
 async destroyAllPermanently(): Promise<void> {
  const records = await this.fetch()
  await allPromises((record) => record.destroyPermanently(), records)
 }

 // MARK: - Internals

 /**
  * `Model` subclass associated with this query
  */
 get modelClass(): Class<Record> {
  return this.collection.modelClass
 }

 /**
  * Table name of the Collection associated with this query
  */
 get table(): TableName<Record> {
  // $FlowFixMe
  return this.modelClass.table
 }

 // TODO: Should any of the below be public API? Is this any useful outside of Watermelon
 // internals? If so, should it even be here, not `_`-prefixed?
 get secondaryTables(): TableName<any>[] {
  return this.description.joinTables.concat(
   this.description.nestedJoinTables.map(({ to }) => to)
  )
 }

 get allTables(): TableName<any>[] {
  return [this.table].concat(this.secondaryTables)
 }

 private _associationsCache?: QueryAssociation[]
 get associations(): QueryAssociation[] {
  return (this._associationsCache ??= getAssociations(
   this.description,
   this.modelClass,
   this.collection.db
  ))
 }

 // null is a valid result, so cache with an undefined check
 private _columnDependenciesCache?: QueryColumnDependencies | null
 get _columnDependencies(): QueryColumnDependencies | null {
  if (this._columnDependenciesCache === undefined) {
   this._columnDependenciesCache = getColumnDependencies(
    this.table,
    this.description,
    this.associations
   )
  }
  return this._columnDependenciesCache
 }

 private _serializedCache?: SerializedQuery
 get _serialized(): SerializedQuery {
  return (this._serializedCache ??= {
   table: this.table,
   description: this.description,
   associations: this.associations,
  })
 }

 // Serialized version of Query (e.g. for sending to web worker)
 serialize(): SerializedQuery {
  return this._serialized
 }
}
