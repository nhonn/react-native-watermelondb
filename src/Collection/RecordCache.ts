import logger from '../utils/common/logger'
import type { default as Model, RecordId } from '../Model'
import type Collection from './index'
import type { CachedQueryResult } from '../adapters/type'
import type { TableName } from '../Schema'
import type { RawRecord } from '../RawRecord'
type Instantiator<T> = (arg0: RawRecord) => T
const SWEEP_EVERY_ADDS = 500
export default class RecordCache<Record extends Model> {
  map: Map<RecordId, WeakRef<Record>> = new Map()
  _addsSinceSweep: number = 0
  tableName: TableName<Record>
  recordInsantiator: Instantiator<Record>
  _debugCollection: Collection<Record>

  constructor(
    tableName: TableName<Record>,
    recordInsantiator: Instantiator<Record>,
    collection: Collection<Record>
  ) {
    this.tableName = tableName
    this.recordInsantiator = recordInsantiator
    this._debugCollection = collection
  }

  get(id: RecordId): Record | null | undefined {
    return this._live(id)
  }

  _live(id: RecordId): Record | undefined {
    return this.map.get(id)?.deref()
  }

  add(record: Record): void {
    this.map.set(record.id, new WeakRef(record))
    // threshold grows with the map so bulk loads stay amortized O(1) per add
    if (
      ++this._addsSinceSweep >= Math.max(SWEEP_EVERY_ADDS, this.map.size >> 1)
    )
      this._sweep()
  }

  // Dead refs are dropped here and reported to the adapter, so both sides forget garbage-collected models.
  // No FinalizationRegistry: Hermes support is uncertain.
  _sweep(): void {
    this._addsSinceSweep = 0
    const dead: RecordId[] = []
    this.map.forEach((ref, id) => {
      if (!ref.deref()) dead.push(id)
    })
    if (!dead.length) return
    dead.forEach((id) => this.map.delete(id))
    this._debugCollection.database.adapter.underlyingAdapter.forgetCachedRecords(
      this.tableName,
      dead
    )
  }

  delete(record: Record): void {
    this.map.delete(record.id)
  }

  unsafeClear(): void {
    this.map = new Map()
  }

  recordsFromQueryResult(result: CachedQueryResult): Record[] {
    const rebuilt = this._rebuildForgotten(this._forgottenIds(result))
    return result.map((res) =>
      typeof res === 'string'
        ? (rebuilt.get(res) ?? this._live(res)!)
        : this._modelForRaw(res)
    )
  }

  recordFromQueryResult(result: RecordId | RawRecord): Record {
    if (typeof result === 'string') {
      return this._live(result) ?? this._rebuildForgotten([result]).get(result)!
    }

    return this._modelForRaw(result)
  }

  rawRecordsFromQueryResult(results: CachedQueryResult): RawRecord[] {
    const rebuilt = this._rebuildForgotten(this._forgottenIds(results))
    return results.map((res) => {
      if (typeof res === 'string') {
        return (rebuilt.get(res) ?? this._live(res)!)._raw
      }

      const cachedRecord = this._live(res.id)
      return cachedRecord ? cachedRecord._raw : res
    })
  }

  _forgottenIds(results: CachedQueryResult): RecordId[] {
    const ids: RecordId[] = []
    results.forEach((res) => {
      if (typeof res === 'string' && !this._live(res)) ids.push(res)
    })
    return ids
  }

  // The models were garbage-collected before a sweep told the adapter: re-read all their rows
  // in one call and rebuild them. The returned map keeps the new models alive until the caller is done.
  _rebuildForgotten(ids: RecordId[]): Map<RecordId, Record> {
    const models = new Map<RecordId, Record>()
    if (!ids.length) return models

    this._debugCollection.database.adapter.underlyingAdapter
      .refetchForgottenRecords(this.tableName, ids)
      .forEach((raw) => models.set(raw.id, this._modelForRaw(raw)))

    ids.forEach((id) => {
      if (models.has(id)) return
      // Reaching this branch indicates a WatermelonDB/adapter bug: the adapter said the record is
      // cached in JS, but it doesn't exist at all
      const message = `Record ID ${this.tableName}#${id} was sent over the bridge, but it's not cached`
      logger.error(message)
      throw new Error(message)
    })
    return models
  }

  _modelForRaw(raw: RawRecord): Record {
    // This may legitimately happen if we previously got ID without a record and we cleared
    // adapter-side cached record ID maps to recover
    const cachedRecord = this._live(raw.id)
    if (cachedRecord) return cachedRecord

    // Return new model
    const newRecord = this.recordInsantiator(raw)
    this.add(newRecord)
    return newRecord
  }
}
