import {
  // $FlowFixMe
  values,
  identity,
  unnest,
  allPromises,
  mapObj,
} from '../../utils/fp'
import allPromisesObj from '../../utils/fp/allPromisesObj'
import type { Database, Collection, Model } from '../..'
import * as Q from '../../QueryDescription'
import { columnName } from '../../Schema'
import type { SyncTableChangeSet, SyncLocalChanges } from '../index'
// NOTE: Two separate queries are faster than notEq(synced)
const createdQuery = Q.where(columnName('_status'), 'created')
const updatedQuery = Q.where(columnName('_status'), 'updated')

async function fetchLocalChangesForCollection<T extends Model>(
  collection: Collection<T>
): Promise<[SyncTableChangeSet, T[]]> {
  const [createdRecords, updatedRecords, deletedRecords] = await Promise.all([
    collection.query(createdQuery).fetch(),
    collection.query(updatedQuery).fetch(),
    collection.database.adapter.getDeletedRecords(collection.table),
  ])
  const changeSet: SyncTableChangeSet = {
    created: [] as any[],
    updated: [] as any[],
    deleted: deletedRecords,
  }
  // TODO: It would be best to omit _status, _changed fields, since they're not necessary for the server
  // but this complicates markLocalChangesAsDone, since we don't have the exact copy to compare if record changed
  // TODO: It would probably also be good to only send to server locally changed fields, not full records
  // perf-critical - using mutation
  createdRecords.forEach((record) => {
    changeSet.created.push(Object.assign({}, record._raw))
  })
  updatedRecords.forEach((record) => {
    changeSet.updated.push(Object.assign({}, record._raw))
  })
  const changedRecords = createdRecords.concat(updatedRecords)
  return [changeSet, changedRecords]
}

export default function fetchLocalChanges(
  db: Database
): Promise<SyncLocalChanges> {
  return db.read(async () => {
    const changes = (await allPromisesObj(
      mapObj(fetchLocalChangesForCollection, db.collections.map) as Record<
        string,
        Promise<any>
      >
    )) as Record<string, [SyncTableChangeSet, Model[]]>
    // TODO: deep-freeze changes object (in dev mode only) to detect mutations (user bug)
    return {
      changes: mapObj(([changeSet]: [SyncTableChangeSet]) => changeSet)(
        changes
      ),
      affectedRecords: unnest(
        values(changes).map(([, records]: any) => records)
      ),
    }
  }, 'sync-fetchLocalChanges')
}
export function hasUnsyncedChanges(db: Database): Promise<boolean> {
  // action is necessary to ensure other code doesn't make changes under our nose
  return db.read(async () => {
    const collections: Collection<any>[] = values(db.collections.map)

    const hasUnsynced = async (collection: Collection<any>) => {
      const created = await collection.query(createdQuery).fetchCount()
      const updated = await collection.query(updatedQuery).fetchCount()
      const deleted = await db.adapter.getDeletedRecords(collection.table)
      return created + updated + deleted.length > 0
    }

    const unsyncedFlags = await allPromises(hasUnsynced, collections)
    return unsyncedFlags.some(identity)
  }, 'sync-hasUnsyncedChanges')
}
