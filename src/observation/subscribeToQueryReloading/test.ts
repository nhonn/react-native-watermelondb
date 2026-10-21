import { mockDatabase } from '../../__tests__/testModels'
import * as Q from '../../QueryDescription'
import subscribeToQueryReloading from './index'

const prepareTask = (tasks: any, name: any, isCompleted: any) =>
  tasks.prepareCreate((mock: any) => {
    mock.name = name
    mock.isCompleted = isCompleted
    mock.project.id = 'MOCK_PROJECT'
  })

const createTask = async (tasks: any, name: any, isCompleted: any) => {
  const task = prepareTask(tasks, name, isCompleted)
  await tasks.database.batch(task)
  return task
}

const updateTask = (task: any, updater: any) =>
  task.collection.database.write(() => task.update(updater))

describe('subscribeToQueryReloading', () => {
  it('observes changes to query', async () => {
    const { db, tasks, projects } = mockDatabase()
    const query = tasks.query(
      Q.where('is_completed', true),
      Q.on('mock_projects', Q.where('name', 'hello'))
    )
    // preparation - create mock project
    let project: any
    let m1: any
    let m2
    let m3
    await db.write(() => {
      project = projects.prepareCreateFromDirtyRaw({
        id: 'MOCK_PROJECT',
        name: 'hello',
      })
      m1 = prepareTask(tasks, 'name1', true)
      m2 = prepareTask(tasks, 'name2', true)
      m3 = prepareTask(tasks, 'name3', false)
      return db.batch(project, m1, m2, m3)
    })
    // start observing
    const observer = jest.fn()
    const unsubscribe = subscribeToQueryReloading(query, observer)

    const waitForNextQuery = () => tasks.query().fetch()

    await waitForNextQuery() // wait for initial query to go through

    expect(observer).toHaveBeenCalledTimes(1)
    expect(observer).toHaveBeenLastCalledWith([m1, m2])
    // add matching model
    const m4 = await db.write(() => createTask(tasks, 'name4', true))
    await waitForNextQuery()
    expect(observer).toHaveBeenCalledTimes(2)
    expect(observer).toHaveBeenLastCalledWith([m1, m2, m4])
    // remove matching model
    await db.write(() => m1.markAsDeleted())
    await waitForNextQuery()
    expect(observer).toHaveBeenCalledTimes(3)
    expect(observer).toHaveBeenLastCalledWith([m2, m4])
    // some irrelevant change (no emission)
    await updateTask(m2, (task: any) => {
      task.name = 'changed name'
    })
    await waitForNextQuery()
    expect(observer).toHaveBeenCalledTimes(3)
    // change model in other table
    await db.write(() =>
      project.update(() => {
        project.name = 'other'
      })
    )
    await waitForNextQuery()
    expect(observer).toHaveBeenCalledTimes(4)
    expect(observer).toHaveBeenLastCalledWith([])
    // ensure record subscriptions are disposed properly
    unsubscribe()
    await db.write(() =>
      project.update(() => {
        project.name = 'hello'
      })
    )
    expect(observer).toHaveBeenCalledTimes(4)
  })
  it('calls observer even if query is empty (regression test)', async () => {
    const { tasks } = mockDatabase()
    const observer = jest.fn()
    const unsubscribe = subscribeToQueryReloading(tasks.query(), observer)

    const waitForNextQuery = () => tasks.query().fetch()

    await waitForNextQuery() // wait for initial query to go through

    expect(observer).toHaveBeenCalledTimes(1)
    expect(observer).toHaveBeenLastCalledWith([])
    unsubscribe()
  })
  it('skips reload for irrelevant changes', async () => {
    const { db, tasks } = mockDatabase()
    const spy = jest.spyOn(tasks, '_fetchQuery')
    const [m1, m2, m3] = await db.write(async () => [
      await createTask(tasks, 'a', true),
      await createTask(tasks, 'b', true),
      await createTask(tasks, 'c', false),
    ])
    const observer = jest.fn()
    const unsubscribe = subscribeToQueryReloading(
      tasks.query(
        Q.where('is_completed', true),
        Q.sortBy('name', Q.asc),
        Q.take(2)
      ),
      observer
    )
    const waitForNextQuery = () => tasks.database.adapter.getLocal("x")
    await waitForNextQuery()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(observer).toHaveBeenLastCalledWith([m1, m2])

    await updateTask(m3, (t: any) => {
      t.name = 'c2'
    })
    await waitForNextQuery()
    expect(spy).toHaveBeenCalledTimes(1)

    await db.write(() => createTask(tasks, 'd', false))
    await waitForNextQuery()
    expect(spy).toHaveBeenCalledTimes(1)

    await updateTask(m3, (t: any) => {
      t.isCompleted = true
    })
    await waitForNextQuery()
    expect(spy).toHaveBeenCalledTimes(2)

    await updateTask(m1, (t: any) => {
      t.name = 'a2'
    })
    await waitForNextQuery()
    expect(spy).toHaveBeenCalledTimes(3)
    unsubscribe()
  })
  it('always reloads with skip', async () => {
    const { db, tasks } = mockDatabase()
    const spy = jest.spyOn(tasks, '_fetchQuery')
    const m1 = await db.write(() => createTask(tasks, 'a', false))
    const unsubscribe = subscribeToQueryReloading(
      tasks.query(Q.where('is_completed', true), Q.take(1), Q.skip(1)),
      jest.fn()
    )
    const waitForNextQuery = () => tasks.database.adapter.getLocal("x")
    await waitForNextQuery()
    expect(spy).toHaveBeenCalledTimes(1)
    await updateTask(m1, (t: any) => {
      t.name = 'b'
    })
    await waitForNextQuery()
    expect(spy).toHaveBeenCalledTimes(2)
    unsubscribe()
  })
})
