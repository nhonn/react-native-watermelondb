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
    return result.map((res) => this.recordFromQueryResult(res))
  }

  recordFromQueryResult(result: RecordId | RawRecord): Record {
    if (typeof result === 'string') {
      return this._cachedModelForId(result)
    }

    return this._modelForRaw(result)
  }

  rawRecordsFromQueryResult(results: CachedQueryResult): RawRecord[] {
    return results.map((res) => {
      if (typeof res === 'string') {
        return this._cachedModelForId(res)._raw
      }

      const cachedRecord = this._live(res.id)
      return cachedRecord ? cachedRecord._raw : res
    })
  }

  _cachedModelForId(id: RecordId): Record {
    const record = this._live(id)
    if (record) return record

    // The model was garbage-collected before a sweep told the adapter: re-read its row and rebuild it
    const raw =
      this._debugCollection.database.adapter.underlyingAdapter.refetchForgottenRecord(
        this.tableName,
        id
      )
    if (raw) return this._modelForRaw(raw, false)

    // Reaching this branch indicates a WatermelonDB/adapter bug: the adapter said the record is
    // cached in JS, but it doesn't exist at all
    const message = `Record ID ${this.tableName}#${id} was sent over the bridge, but it's not cached`
    logger.error(message)
    throw new Error(message)
  }

  _modelForRaw(raw: RawRecord, warnIfCached: boolean = true): Record {
    // Sanity check: is this already cached?
    const cachedRecord = this._live(raw.id)

    if (cachedRecord) {
      // This may legitimately happen if we previously got ID without a record and we cleared
      // adapter-side cached record ID maps to recover
      if (warnIfCached) {
        logger.warn(
          `Record ${this.tableName}#${cachedRecord.id} is cached, but full raw object was sent over the bridge`
        )
      }
      return cachedRecord
    }

    // Return new model
    const newRecord = this.recordInsantiator(raw)
    this.add(newRecord)
    return newRecord
  }
}
