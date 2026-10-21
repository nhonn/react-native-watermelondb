import { setImmediate } from 'timers/promises'
import { makeDispatcher } from '.'

let mockDb: any // `mock` prefix: jest.mock factories may only reference such variables
jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    createHybridObject: (name: string) =>
      name === 'DatabasePaths'
        ? { databaseDirectory: '/db' }
        : { createDatabase: () => mockDb },
  },
}))

const asyncDispatcher = () =>
  makeDispatcher('test', { usesExclusiveLocking: false, synchronous: false })

describe('SqliteNitroDispatcher (async)', () => {
  let log: string[]
  let batch: PromiseWithResolvers<void>
  beforeEach(() => {
    log = []
    batch = Promise.withResolvers<void>()
    // every async method waits for the batch, like the serial native queue
    mockDb = {
      batch: jest.fn(() => (log.push('batch'), batch.promise.then(() => { }))),
      find: jest.fn(() => (log.push('find'), batch.promise.then(() => 'async'))),
      findSync: jest.fn(() => 'sync'),
      readMany: jest.fn((calls: any[]) => {
        log.push(`readMany:${calls.map((c) => c.method).join(',')}`)
        return batch.promise.then(() =>
          calls.map((c) =>
            c.method === 'count'
              ? { error: 'boom' }
              : c.method === 'find'
                ? { find: c.args[0] }
                : { records: [c.sql] }
          )
        )
      }),
    }
  })

  it('runs find synchronously only while no async call is in flight', async () => {
    const dispatcher = asyncDispatcher()
    const results: any[] = []
    const record = (result: any) => results.push(result.value)

    dispatcher.call('find', ['t', 'a'], record)
    expect(results).toEqual(['sync']) // idle: no hop

    dispatcher.call('batch', [[]], record)
    dispatcher.call('find', ['t', 'a'], record) // must queue behind the batch
    await setImmediate()
    expect(mockDb.findSync).toHaveBeenCalledTimes(1)
    expect(log).toEqual(['batch', 'find'])

    batch.resolve()
    await setImmediate() // flush promise callbacks
    expect(results).toEqual(['sync', undefined, 'async'])

    dispatcher.call('find', ['t', 'a'], record)
    expect(results).toEqual(['sync', undefined, 'async', 'sync'])
  })

  it('sends same-tick reads as one readMany, after earlier and before later writes', async () => {
    const dispatcher = asyncDispatcher()
    const results: any[] = []
    const record = (result: any) =>
      results.push(result.error ? result.error.message : result.value)

    dispatcher.call('batch', [[]], record)
    dispatcher.call('query', ['t', 'select 1', []], record)
    dispatcher.call('count', ['select 2', []], record)
    dispatcher.call('find', ['t', 'x'], record)
    dispatcher.call('batch', [[]], record) // flushes the reads first
    expect(log).toEqual(['batch', 'readMany:query,count,find', 'batch'])

    batch.resolve()
    await setImmediate()
    // a failing read doesn't fail its neighbours
    expect(results).toEqual([undefined, ['select 1'], 'boom', 'x', undefined])
  })
})
