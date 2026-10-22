import { expectToRejectWithMessage } from '../__tests__/utils'
import { noop } from '../utils/fp'
import Query from '../Query'
import * as Q from '../QueryDescription'
import { logger } from '../utils/common'
import { toPromise } from '../utils/fp/Result'
import { mockDatabase, MockTask, testSchema } from '../__tests__/testModels'

const mockQuery = (collection: any) =>
  new Query(collection, [Q.where('a', 'b')])

describe('Collection', () => {
  it(`exposes database`, () => {
    const { db, projects } = mockDatabase()
    expect(projects.database).toBe(db)
    expect(projects.db).toBe(db)
  })
  it('exposes schema', () => {
    const { tasks, projects } = mockDatabase()
    expect(tasks.schema).toBe(testSchema.tables.mock_tasks)
    expect(tasks.schema.name).toBe('mock_tasks')
    expect(tasks.schema.columns.name).toEqual({
      name: 'name',
      type: 'string',
    })
    expect(projects.schema).toBe(testSchema.tables.mock_projects)
  })
  it(`exposes query()`, () => {
    const { tasks } = mockDatabase()
    const conditions = [Q.where('a', 'b'), Q.where('c', 'd')]
    const query = tasks.query(...conditions)
    expect(query).toBeInstanceOf(Query)
    expect(query.collection).toBe(tasks)
  })
  it(`query() can accept both a spread and an array`, () => {
    const { tasks } = mockDatabase()
    const conditions = [Q.where('a', 'b'), Q.where('c', 'd')]
    expect(tasks.query(...conditions).description).toEqual(
      tasks.query(conditions).description
    )
  })
})
describe('finding records', () => {
  it('finds records in cache if available', async () => {
    const { tasks: collection } = mockDatabase()
    const m1 = new MockTask(collection, {
      id: 'm1',
    } as any)

    collection._cache.add(m1)

    expect(await collection.find('m1')).toBe(m1)
    const m2 = new MockTask(collection, {
      id: 'm2',
    } as any)

    collection._cache.add(m2)

    expect(await collection.find('m1')).toBe(m1)
    expect(await collection.find('m2')).toBe(m2)
  })
  it('finds records in database if not in cache', async () => {
    const { tasks: collection, adapter } = mockDatabase()
    // TODO: Don't mock
    // TODO: Should ID (not raw) response be tested?
    adapter.find = jest.fn().mockImplementation((_table, _id, callback) =>
      callback({
        value: {
          id: 'm1',
        },
      })
    )
    // calls db
    const m1 = await collection.find('m1')
    expect(m1._raw).toEqual({
      id: 'm1',
    })
    expect(m1.id).toBe('m1')
    expect(m1.table).toBe('mock_tasks')
    expect(m1.collection).toBe(collection)
    expect(collection._cache.map.size).toBe(1)
    // check call
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(adapter.find.mock.calls[0]).toEqual([
      'mock_tasks',
      'm1',
      expect.anything(),
    ])
    // second find will be from cache
    const m1Cached = await collection.find('m1')
    expect(m1Cached).toBe(m1)
    expect(collection._cache.map.size).toBe(1)
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(adapter.find.mock.calls.length).toBe(1)
  })
  it('rejects promise if record cannot be found', async () => {
    const { tasks: collection, adapter } = mockDatabase()
    const findSpy = jest.spyOn(adapter, 'find')
    await expect(collection.find('m1')).rejects.toBeInstanceOf(Error)
    await expect(collection.find('m1')).rejects.toBeInstanceOf(Error)
    expect(findSpy.mock.calls.length).toBe(2)
  })
  it('quickly rejects for invalid IDs', async () => {
    const { tasks } = mockDatabase()
    // @ts-expect-error ported Flow test code is not type-safe here
    await expectToRejectWithMessage(tasks.find(), 'Invalid record ID')
    await expectToRejectWithMessage(
      tasks.find(null as any),
      'Invalid record ID'
    )
    await expectToRejectWithMessage(tasks.find({} as any), 'Invalid record ID')
  })
})
describe('fetching queries', () => {
  it('fetches queries and caches records', async () => {
    const { tasks: collection, adapter } = mockDatabase()
    adapter.query = jest.fn().mockImplementation((_query, cb) =>
      cb({
        value: [
          {
            id: 'm1',
          },
          {
            id: 'm2',
          },
        ],
      })
    )
    const query = mockQuery(collection)
    // fetch, check models
    const models = await toPromise((callback) =>
      collection._fetchQuery(query, callback)
    )
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(models.length).toBe(2)
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(models[0]._raw).toEqual({
      id: 'm1',
    })
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(models[0].id).toBe('m1')
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(models[0].table).toBe('mock_tasks')
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(models[1]._raw).toEqual({
      id: 'm2',
    })
    // check if records were cached
    expect(collection._cache.map.size).toBe(2)
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(collection._cache.get('m1')).toBe(models[0])
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(collection._cache.get('m2')).toBe(models[1])
    // check if query was passed correctly
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(adapter.query.mock.calls.length).toBe(1)
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(adapter.query.mock.calls[0][0]).toEqual(query.serialize())
  })
  it('fetches query records from cache if possible', async () => {
    const { tasks: collection, adapter } = mockDatabase()
    adapter.query = jest.fn().mockImplementation((_query, cb) =>
      cb({
        value: [
          'm1',
          {
            id: 'm2',
          },
        ],
      })
    )
    const m1 = new MockTask(collection, {
      id: 'm1',
    } as any)

    collection._cache.add(m1)

    // fetch, check models
    const models = await toPromise((cb) =>
      collection._fetchQuery(mockQuery(collection), cb)
    )
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(models.length).toBe(2)
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(models[0]).toBe(m1)
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(models[1]._raw).toEqual({
      id: 'm2',
    })
    // check cache
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(collection._cache.get('m2')).toBe(models[1])
  })
  it('recovers a garbage-collected cached record', async () => {
    const { db, tasks } = mockDatabase()
    const t = await db.write(() => tasks.create((r: any) => { r.name = 'hello' }))
    tasks._cache.map.set(t.id, { deref: () => undefined } as any)
    const [r] = await tasks.query().fetch()
    expect(r).not.toBe(t)
    expect(r!.id).toBe(t.id)
    expect((r as any).name).toBe('hello')
    const [r2] = await tasks.query().fetch()
    expect(r2).toBe(r)
  })
  it('sweeps dead records and forgets them natively', async () => {
    const { db, tasks } = mockDatabase()
    const spy = jest.spyOn(db.adapter.underlyingAdapter, 'forgetCachedRecords')
    const t = await db.write(() => tasks.create())
    tasks._cache.map.set(t.id, { deref: () => undefined } as any)
    await db.write(() =>
      db.batch(Array.from({ length: 500 }, () => tasks.prepareCreate()))
    )
    expect(spy).toHaveBeenCalledWith('mock_tasks', [t.id])
    expect(tasks._cache.map.has(t.id)).toBe(false)
  })
  it('fetches query records from cache even if full raw object was sent', async () => {
    const { tasks: collection, adapter } = mockDatabase()
    adapter.query = jest.fn().mockImplementation((_query, cb) =>
      cb({
        value: [
          {
            id: 'm1',
          },
          {
            id: 'm2',
          },
        ],
      })
    )
    const m1 = new MockTask(collection, {
      id: 'm1',
    } as any)

    collection._cache.add(m1)

    // fetch, check if error occured
    const spy = jest.spyOn(logger, 'warn').mockImplementation(() => { })
    const models = await toPromise((cb) =>
      collection._fetchQuery(mockQuery(collection), cb)
    )
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
    // check models
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(models.length).toBe(2)
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(models[0]).toBe(m1)
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(models[1]._raw).toEqual({
      id: 'm2',
    })
  })
  it('fetches counts', async () => {
    const { tasks: collection, adapter } = mockDatabase()
    adapter.count = jest.fn().mockImplementationOnce((_query, callback) =>
      callback({
        value: 5,
      })
    )
    const query = mockQuery(collection)
    expect(
      await toPromise((callback) => collection._fetchCount(query, callback))
    ).toBe(5)
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(adapter.count.mock.calls.length).toBe(1)
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(adapter.count.mock.calls[0][0]).toEqual(query.serialize())
  })
  it('fetches ids', async () => {
    const { tasks: collection, adapter } = mockDatabase()
    adapter.queryIds = jest.fn().mockImplementationOnce((_query, callback) =>
      callback({
        value: ['a', 'b'],
      })
    )
    const query = mockQuery(collection)
    expect(
      await toPromise((callback) => collection._fetchIds(query, callback))
    ).toEqual(['a', 'b'])
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(adapter.queryIds.mock.calls.length).toBe(1)
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(adapter.queryIds.mock.calls[0][0]).toEqual(query.serialize())
  })
  it('fetches raws', async () => {
    const { tasks: collection, adapter } = mockDatabase()
    adapter.unsafeQueryRaw = jest
      .fn()
      .mockImplementationOnce((_query, callback) =>
        callback({
          value: [
            {
              a: 0,
              b: 1,
            },
          ],
        })
      )
    const query = mockQuery(collection)
    expect(
      await toPromise((callback) => collection._unsafeFetchRaw(query, callback))
    ).toEqual([
      {
        a: 0,
        b: 1,
      },
    ])
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(adapter.unsafeQueryRaw.mock.calls.length).toBe(1)
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(adapter.unsafeQueryRaw.mock.calls[0][0]).toEqual(query.serialize())
  })
})
describe('creating new records', () => {
  it('can create records', async () => {
    const { tasks: collection, adapter, db } = mockDatabase()
    const dbBatchSpy = jest.spyOn(adapter, 'batch')
    const observer = jest.fn()
    collection.changes.subscribe(observer)
    // Check Model._prepareCreate was called
    const newModelSpy = jest.spyOn(MockTask, '_prepareCreate')
    const m1 = await db.write(() => collection.create())
    // Check database insert, cache insert, observers update
    expect(m1._preparedState).toBe(null)
    expect(newModelSpy).toHaveBeenCalledTimes(1)
    expect(dbBatchSpy).toHaveBeenCalledTimes(1)
    expect(dbBatchSpy).toHaveBeenCalledWith(
      [['create', 'mock_tasks', m1._raw]],
      expect.anything()
    )
    expect(observer).toHaveBeenCalledTimes(1)
    expect(observer).toHaveBeenCalledWith([
      {
        record: m1,
        type: 'created',
      },
    ])
    expect(collection._cache.get(m1.id)).toBe(m1)
    expect(await collection.find(m1.id)).toBe(m1)
  })
  it('can prepare records', async () => {
    const { tasks: collection, database } = mockDatabase()
    // @ts-expect-error ported Flow test code is not type-safe here
    database.adapter = {} // make sure not called

    const observer = jest.fn()
    collection.changes.subscribe(observer)
    const newModelSpy = jest.spyOn(MockTask, '_prepareCreate')
    const m1 = collection.prepareCreate()
    expect(m1._preparedState).toBe('create')
    expect(newModelSpy).toHaveBeenCalledTimes(1)
    expect(observer).toHaveBeenCalledTimes(0)
    await expect(collection.find(m1.id)).rejects.toBeInstanceOf(Error)
  })
  it('can prepare records from raw', async () => {
    const { tasks: collection } = mockDatabase()
    const newModelSpy = jest.spyOn(MockTask, '_prepareCreateFromDirtyRaw')
    const m1 = collection.prepareCreateFromDirtyRaw({
      col3: 'hello',
    })
    expect(m1._preparedState).toBe('create')
    expect(newModelSpy).toHaveBeenCalledTimes(1)
  })
  it('can prepare a disposable record from raw', async () => {
    const { tasks: collection } = mockDatabase()
    const newModelSpy = jest.spyOn(MockTask, '_disposableFromDirtyRaw')
    const m1 = collection.disposableFromDirtyRaw({
      col3: 'hello',
    })
    expect(m1.syncStatus).toBe('disposable')
    expect(newModelSpy).toHaveBeenCalledTimes(1)
  })
  it('disallows record creating outside of a writer', async () => {
    const { database, tasks } = mockDatabase()
    await expectToRejectWithMessage(
      tasks.create(noop),
      'can only be called from inside of a Writer'
    )
    await expectToRejectWithMessage(
      database.read(() => tasks.create(noop)),
      'can only be called from inside of a Writer'
    )
    // no throw inside writer
    await database.write(() => tasks.create(noop))
  })
})
describe('Collection observation', () => {
  it('can subscribe to collection changes', async () => {
    const { database, tasks } = mockDatabase()
    await database.write(() => tasks.create())
    const subscriber1 = jest.fn()
    const unsubscribe1 = tasks.experimentalSubscribe(subscriber1)
    expect(subscriber1).toHaveBeenCalledTimes(0)
    const t1 = await database.write(() => tasks.create())
    expect(subscriber1).toHaveBeenCalledTimes(1)
    expect(subscriber1).toHaveBeenLastCalledWith([
      {
        record: t1,
        type: 'created',
      },
    ])
    const subscriber2 = jest.fn()
    const unsubscribe2 = tasks.experimentalSubscribe(subscriber2)
    await database.write(() => t1.update())
    expect(subscriber1).toHaveBeenCalledTimes(2)
    expect(subscriber2).toHaveBeenCalledTimes(1)
    expect(subscriber2).toHaveBeenLastCalledWith([
      {
        record: t1,
        type: 'updated',
        changedColumns: expect.any(Set),
      },
    ])
    unsubscribe1()
    await database.write(() => t1.markAsDeleted())
    expect(subscriber1).toHaveBeenCalledTimes(2)
    expect(subscriber2).toHaveBeenCalledTimes(2)
    expect(subscriber2).toHaveBeenLastCalledWith([
      {
        record: t1,
        type: 'destroyed',
      },
    ])
    unsubscribe2()
    await database.write(() => tasks.create())
    expect(subscriber2).toHaveBeenCalledTimes(2)
  })
  it('unsubscribe can safely be called more than once', async () => {
    const { database, tasks } = mockDatabase()
    const subscriber1 = jest.fn()
    const unsubscribe1 = tasks.experimentalSubscribe(subscriber1)
    expect(subscriber1).toHaveBeenCalledTimes(0)
    const unsubscribe2 = tasks.experimentalSubscribe(() => { })
    unsubscribe2()
    unsubscribe2()
    await database.write(() => tasks.create())
    expect(subscriber1).toHaveBeenCalledTimes(1)
    unsubscribe1()
  })
  it(`can subscribe with the same subscriber multiple times`, async () => {
    const { database, tasks } = mockDatabase()

    const trigger = () => database.write(() => tasks.create())

    const subscriber = jest.fn()
    const unsubscribe1 = tasks.experimentalSubscribe(subscriber)
    expect(subscriber).toHaveBeenCalledTimes(0)
    await trigger()
    expect(subscriber).toHaveBeenCalledTimes(1)
    const unsubscribe2 = tasks.experimentalSubscribe(subscriber)
    await trigger()
    expect(subscriber).toHaveBeenCalledTimes(3)
    unsubscribe2()
    unsubscribe2() // noop

    await trigger()
    expect(subscriber).toHaveBeenCalledTimes(4)
    unsubscribe1()
    await trigger()
    expect(subscriber).toHaveBeenCalledTimes(4)
  })
})
