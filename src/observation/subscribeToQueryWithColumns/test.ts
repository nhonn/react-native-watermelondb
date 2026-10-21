import { last } from 'rambdax'
import { mockDatabase } from '../../__tests__/testModels'
import * as Q from '../../QueryDescription'
import subscribeToQueryWithColumns from './index'

const prepareTask = (tasks: any, name: any, isCompleted: any, position: any) =>
  tasks.prepareCreate((mock: any) => {
    mock.name = name
    mock.isCompleted = isCompleted
    mock.position = position
    mock.project.id = 'MOCK_PROJECT'
  })

const createTask = async (
  tasks: any,
  name: any,
  isCompleted: any,
  position: any
) => {
  const task = prepareTask(tasks, name, isCompleted, position)
  await tasks.database.batch(task)
  return task
}

const updateTask = (task: any, updater: any) =>
  task.collection.database.write(() => task.update(updater))

describe('subscribeToQueryWithColumns', () => {
  async function fullObservationTest(
    mockDb: any,
    query: any,
    asyncSource: any
  ) {
    const { db, tasks, projects } = mockDb
    // preparation - create mock project
    await db.write(() =>
      db.batch(
        projects.prepareCreateFromDirtyRaw({
          id: 'MOCK_PROJECT',
        })
      )
    )
    // start observing
    const observer = jest.fn()
    const unsubscribe = subscribeToQueryWithColumns(
      query,
      ['position'],
      observer
    )

    const waitForNextQuery = () => tasks.query().fetch()

    await waitForNextQuery() // wait for initial query to go through

    expect(observer).toHaveBeenCalledTimes(1)
    expect(observer).toHaveBeenLastCalledWith([])
    // make some models
    let m1: any
    let m2: any
    let m3: any
    await db.write(async () => {
      m1 = prepareTask(tasks, 'name1', true, 10)
      m2 = prepareTask(tasks, 'name2', true, 20)
      m3 = prepareTask(tasks, 'name3', false, 30)
      await db.batch(
        m1,
        prepareTask(tasks, 'name_irrelevant', false, 30),
        m2,
        m3
      )
    })
    if (asyncSource) await waitForNextQuery()
    expect(observer).toHaveBeenCalledTimes(2)
    expect(observer).toHaveBeenLastCalledWith([m1, m2])
    // add matching model
    const m4 = await db.write(() => createTask(tasks, 'name4', true, 40))
    if (asyncSource) await waitForNextQuery()
    expect(observer).toHaveBeenCalledTimes(3)
    expect(observer).toHaveBeenLastCalledWith([m1, m2, m4])
    // remove matching model
    await db.write(() => m1.markAsDeleted())
    if (asyncSource) await waitForNextQuery()
    expect(observer).toHaveBeenCalledTimes(4)
    expect(observer).toHaveBeenLastCalledWith([m2, m4])
    // some irrelevant change (no emission)
    await updateTask(m2, (task: any) => {
      task.name = 'changed name'
    })
    if (asyncSource) await waitForNextQuery()
    expect(observer).toHaveBeenCalledTimes(4)
    // change model to start matching
    await updateTask(m3, (task: any) => {
      task.isCompleted = true
    })
    if (asyncSource) await waitForNextQuery()
    expect(observer).toHaveBeenCalledTimes(5)
    expect(last(observer.mock.calls)[0]).toHaveLength(3)
    expect(last(observer.mock.calls)[0]).toEqual(
      expect.arrayContaining([m2, m3, m4])
    )
    // change model to no longer match
    // make sure changed model isn't re-emitted before source query removes it
    await updateTask(m2, (task: any) => {
      task.isCompleted = false
    })
    if (asyncSource) await waitForNextQuery()
    expect(observer).toHaveBeenCalledTimes(6)
    expect(last(observer.mock.calls)[0]).toHaveLength(2)
    expect(last(observer.mock.calls)[0]).toEqual(
      expect.arrayContaining([m3, m4])
    )
    // change a relevant field in previously-observed record (no emission)
    await updateTask(m2, (task: any) => {
      task.position = 10
    })
    if (asyncSource) await waitForNextQuery()
    expect(observer).toHaveBeenCalledTimes(6)
    // make multiple simultaneous changes to observed records - expect only one emission
    await db.write(() =>
      db.batch(
        m2.prepareUpdate(() => {
          // not observed anymore - irrelevant
          m2.position = 100
        }),
        m3.prepareUpdate(() => {
          m3.position = 100
        }),
        m4.prepareUpdate(() => {
          m4.position = 100
        })
      )
    )
    if (asyncSource) await waitForNextQuery()
    expect(observer).toHaveBeenCalledTimes(7)
    expect(observer).toHaveBeenLastCalledWith(
      ...observer.mock.calls[observer.mock.calls.length - 2]
    )
    // make an irrelevant change to recently changed record (no emission)
    // Note: This is a regression check for a situation where task had a relevant change,
    // but new record state was not cached, so another irrelevant change triggered an update
    await updateTask(m4, (task: any) => {
      task.name = 'different name'
    })
    if (asyncSource) await waitForNextQuery()
    expect(observer).toHaveBeenCalledTimes(7)

    // make irrelevant changes to secondary table (async join query)
    if (asyncSource) {
      await db.write(() =>
        db.batch(projects.prepareCreate(), projects.prepareCreate())
      )
      await waitForNextQuery()
      expect(observer).toHaveBeenCalledTimes(7)
    }

    // ensure record subscriptions are disposed properly
    unsubscribe()
    await updateTask(m3, (mock: any) => {
      mock.position += 1
    })
    expect(observer).toHaveBeenCalledTimes(7)
  }

  it('observes changes correctly - test with simple observer', async () => {
    const mockDb = mockDatabase()
    const query = mockDb.tasks.query(Q.where('is_completed', true))
    await fullObservationTest(mockDb, query, false)
  })
  it('observes changes correctly - test with reloading observer', async () => {
    const mockDb = mockDatabase()
    const query = mockDb.tasks.query(
      Q.where('is_completed', true), // fake query to force to use reloading observer
      Q.on('mock_projects', Q.where('id', Q.notEq(null)))
    )
    await fullObservationTest(mockDb, query, true)
  })
})
