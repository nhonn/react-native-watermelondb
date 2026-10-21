import { invariant } from '../../utils/common'
import {
  applyRemoteChanges,
  fetchLocalChanges,
  markLocalChangesAsSynced,
  getLastPulledAt,
  setLastPulledAt,
  setLastPulledSchemaVersion,
  getMigrationInfo,
} from './index'
import { ensureSameDatabase, isChangeSetEmpty, changeSetCount } from './helpers'
import type { SyncArgs, Timestamp, SyncPullStrategy } from '../index'
export default async function synchronize({
  database,
  pullChanges,
  onWillApplyRemoteChanges,
  onDidPullChanges,
  pushChanges,
  sendCreatedAsUpdated = false,
  migrationsEnabledAtVersion,
  log,
  conflictResolver,
  _unsafeBatchPerCollection,
}: SyncArgs): Promise<void> {
  const resetCount = database._resetCount
  if (log) log.startedAt = new Date()
  if (log) log.phase = 'starting'
  // TODO: Wrap the three computionally intensive phases in `requestIdleCallback`
  // pull phase
  const lastPulledAt = await getLastPulledAt(database)
  if (log) log.lastPulledAt = lastPulledAt
  const { schemaVersion, migration, shouldSaveSchemaVersion } =
    await getMigrationInfo(
      database,
      log,
      lastPulledAt,
      migrationsEnabledAtVersion
    )
  if (log) log.phase = 'ready to pull'
  // $FlowFixMe
  const pullResult = await pullChanges({
    lastPulledAt,
    schemaVersion,
    migration,
  })
  if (log) log.phase = 'pulled'
  let newLastPulledAt: Timestamp = (pullResult as any).timestamp
  const remoteChangeCount = pullResult.changes
    ? changeSetCount(pullResult.changes)
    : NaN

  if (onWillApplyRemoteChanges) {
    await onWillApplyRemoteChanges({
      remoteChangeCount,
    })
  }

  await database.write(async () => {
    ensureSameDatabase(database, resetCount)
    invariant(
      lastPulledAt === (await getLastPulledAt(database)),
      '[Sync] Concurrent synchronization is not allowed. More than one synchronize() call was running at the same time, and the later one was aborted before committing results to local database.'
    )

    if (log) log.newLastPulledAt = newLastPulledAt
    invariant(
      typeof newLastPulledAt === 'number' && newLastPulledAt > 0,
      `pullChanges() returned invalid timestamp ${newLastPulledAt}. timestamp must be a non-zero number`
    )

    // $FlowFixMe
    const { changes: remoteChanges, ...resultRest } = pullResult
    if (log) log.remoteChangeCount = remoteChangeCount
    // $FlowFixMe
    await applyRemoteChanges(remoteChanges, {
      db: database,
      strategy: (pullResult as any).experimentalStrategy as
        | SyncPullStrategy
        | null
        | undefined,
      sendCreatedAsUpdated,
      log,
      conflictResolver,
      _unsafeBatchPerCollection,
    })
    if (onDidPullChanges) onDidPullChanges(resultRest)

    if (log) log.phase = 'applied remote changes'
    await setLastPulledAt(database, newLastPulledAt)

    if (shouldSaveSchemaVersion) {
      await setLastPulledSchemaVersion(database, schemaVersion)
    }
  }, 'sync-synchronize-apply')

  // push phase
  if (pushChanges) {
    if (log) log.phase = 'ready to fetch local changes'
    const localChanges = await fetchLocalChanges(database)
    if (log) log.localChangeCount = changeSetCount(localChanges.changes)
    if (log) log.phase = 'fetched local changes'
    ensureSameDatabase(database, resetCount)

    if (!isChangeSetEmpty(localChanges.changes)) {
      if (log) log.phase = 'ready to push'
      const pushResult =
        (await pushChanges({
          changes: localChanges.changes,
          lastPulledAt: newLastPulledAt,
        })) || {}
      if (log) log.phase = 'pushed'
      if (log) log.rejectedIds = pushResult.experimentalRejectedIds
      ensureSameDatabase(database, resetCount)
      await markLocalChangesAsSynced(
        database,
        localChanges,
        pushResult.experimentalRejectedIds
      )
      if (log) log.phase = 'marked local changes as synced'
    }
  } else {
    if (log) log.phase = 'pushChanges not defined'
  }

  if (log) log.finishedAt = new Date()
  if (log) log.phase = 'done'
}
