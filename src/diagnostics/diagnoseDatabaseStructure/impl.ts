/* eslint-disable no-continue */
import forEachAsync from '../../utils/fp/forEachAsync'
import type { Database } from '../..'
import { columnName } from '../../Schema'
import * as Q from '../../QueryDescription'
import censorRaw from '../censorRaw'
import type {
  DiagnoseDatabaseStructureOptions,
  DatabaseStructureDiagnosis,
} from './index'

const pad = (text: string, len: number) => {
  const padding = Array(Math.max(0, len - text.length))
    .fill(' ')
    .join('')
  return `${text}${padding}`
}

const yieldLog = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const getCollections = (db: Database) =>
  Object.entries(db.collections.map).map(([table, collection]) => {
    return {
      name: table,
      // $FlowFixMe
      parents: (
        Object.entries(collection.modelClass.associations) as [string, any][]
      )
        .filter(([, association]) => association.type === 'belongs_to')
        .map(([parentTable, association]): [string, string] => [
          parentTable,
          association.key,
        ]),
    }
  })

const logCollections = (
  log: (text?: string) => void,
  collections: Array<{
    name: string
    parents: Array<Array<any | string>>
  }>
) => {
  collections.forEach(({ name, parents }) => {
    const parentsText = parents.length
      ? parents.map(([table, key]) => pad(`${table}(${key})`, 27)).join(', ')
      : '(root)'
    log(`- ${pad(name, 20)}: ${parentsText}`)
  })
  log()
}

export default function diagnoseDatabaseStructure({
  db,
  log: _log = () => {},
  shouldSkipParent = () => false,
  isOrphanAllowed = async () => false,
}: DiagnoseDatabaseStructureOptions): Promise<DatabaseStructureDiagnosis> {
  return db.read(async () => {
    const startTime = Date.now()
    let logText = ''

    const log = (text: string = '') => {
      logText = `${logText}\n${text}`

      _log(text)
    }

    let totalIssueCount = 0
    log('# Database structure diagnostics')
    log()

    log('## Collection parent-child relations')
    log()
    const collections = getCollections(db)
    // log(JSON.stringify(collections, null, 2))
    log('```')
    logCollections(log, collections)
    log('```')
    await yieldLog()
    await forEachAsync(collections, async ({ name, parents }) => {
      log(`## Structure of ${name}`)
      log()

      if (!parents.length) {
        log(`(skipping - no parents)`)
        log()
        return
      }

      await yieldLog()
      const records = await db.collections // $FlowFixMe
        .get(name)
        .query()
        .fetch()
      log(`Found ${records.length} \`${name}\``)
      await yieldLog()
      let collectionOrphanCount = 0
      await forEachAsync(parents, async ([parentName, key]) => {
        const expectedParentSet = new Set<any>()
        records.forEach((record) => {
          const id = record._getRaw(key)

          if (
            id !== null &&
            !shouldSkipParent({
              tableName: name as any,
              parentTableName: parentName as any,
              relationKey: key as any,
              record: record._raw,
            })
          ) {
            expectedParentSet.add(id)
          }
        })
        const expectedParents = [...expectedParentSet]
        const parentsFound = await db.collections // $FlowFixMe
          .get(parentName) // $FlowFixMe
          .query(Q.where(columnName('id'), Q.oneOf(expectedParents)))
          .fetch()
        log()
        log(
          `Found ${parentsFound.length} parent \`${parentName}\` (via \`${name}.${key}\`)`
        )
        const allowedOprhans = []

        if (parentsFound.length !== expectedParents.length) {
          const foundParentSet = new Set(
            parentsFound.map((record) => record.id)
          )
          const orphans: any[] = []
          await forEachAsync(records, async (record) => {
            const parentId = record._getRaw(key)

            if (
              parentId === null ||
              foundParentSet.has(parentId) ||
              shouldSkipParent({
                tableName: name as any,
                parentTableName: parentName as any,
                relationKey: key as any,
                record: record._raw,
              })
            ) {
              // ok
            } else if (
              await isOrphanAllowed({
                tableName: name as any,
                parentTableName: parentName as any,
                relationKey: key as any,
                record: record._raw,
              })
            ) {
              allowedOprhans.push(record)
            } else {
              orphans.push(record)
            }
          })

          if (orphans.length) {
            collectionOrphanCount += orphans.length
            log(
              `❌ Error! ${
                expectedParents.length - parentsFound.length
              } missing parent \`${parentName}\` across ${
                orphans.length
              } orphans:`
            )
            orphans.forEach((orphan) => {
              log()
              log(
                `MISSING PARENT \`${parentName}.${orphan._getRaw(
                  key
                )} (via ${key})\`:`
              )
              log()
              log('```')
              log(`${JSON.stringify(censorRaw(orphan._raw), null, '  ')}`)
              log('```')
            })
          }

          await yieldLog()

          if (allowedOprhans.length) {
            log(
              `❓ Config allowed ${allowedOprhans.length} orphans for this field`
            ) // log(allowedOprhans.join(','))
          }
        }

        await yieldLog()
      })

      if (!collectionOrphanCount) {
        // log(`No orphans found in ${name}`)
      }

      totalIssueCount += collectionOrphanCount
      log()
    })
    log('## Conclusion')
    log()

    if (totalIssueCount) {
      log(`❌ ${totalIssueCount} issues found`)
    } else {
      log(`✅ No issues found in this database!`)
    }

    log()
    log(`Done in ${(Date.now() - startTime) / 1000} s.`)
    return {
      issueCount: totalIssueCount,
      log: logText,
    }
  })
}
