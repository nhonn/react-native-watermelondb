import { mockDatabase } from '../../__tests__/testModels'
import * as Q from '../../QueryDescription'
import subscribeToCount from './index'

const prepareTask = (tasks: any, isCompleted: any) =>
  tasks.prepareCreate((mock: any) => {
    mock.isCompleted = isCompleted
  })

const createTask = async (tasks: any, isCompleted: any) => {
  const task = prepareTask(tasks, isCompleted)
  await tasks.database.batch(task)
  return task
}

const updateTask = (task: any, updater: any) =>
  task.collection.database.write(() => task.update(updater))

describe('subscribeToCount', () => {
  it('observes changes to count', async () => {
    const { db, tasks } = mockDatabase()
    const query = tasks.query(Q.where('is_completed', true))
    // start observing
    const observer = jest.fn()
    const unsubscribe = subscribeToCount(query, false, observer)

    const waitForNextQuery = () => tasks.query().fetch()

    await waitForNextQuery() // wait for initial query to go through

    expect(observer).toHaveBeenCalledTimes(1)
    expect(observer).toHaveBeenLastCalledWith(0)
    // add matching model
    const t1 = await db.write(() => createTask(tasks, true))
    await waitForNextQuery()
    expect(observer).toHaveBeenCalledTimes(2)
    expect(observer).toHaveBeenLastCalledWith(1)
    // add many
    let t2: any
    let t3: any
    await db.write(() => {
      t2 = prepareTask(tasks, true)
      t3 = prepareTask(tasks, true)
      return db.batch(t2, t3)
    })
    await waitForNextQuery()
    expect(observer).toHaveBeenCalledTimes(3)
    expect(observer).toHaveBeenLastCalledWith(3)
    // irrelevant chagne
    await updateTask(t2, () => {
      t2.name = 'hello'
    })
    await waitForNextQuery()
    expect(observer).toHaveBeenCalledTimes(3)
    // remove some
    await db.write(() => t2.destroyPermanently())
    await waitForNextQuery()
    expect(observer).toHaveBeenCalledTimes(4)
    expect(observer).toHaveBeenLastCalledWith(2)
    // change to no longer match
    await updateTask(t1, () => {
      t1.isCompleted = false
    })
    await waitForNextQuery()
    expect(observer).toHaveBeenCalledTimes(5)
    expect(observer).toHaveBeenLastCalledWith(1)
    // ensure record subscriptions are disposed properly
    unsubscribe()
    await updateTask(t3, () => {
      t3.isCompleted = false
    })
    expect(observer).toHaveBeenCalledTimes(5)
  })
  it('throttled count emits the trailing change', async () => {
    const { db, tasks } = mockDatabase()
    const query = tasks.query(Q.where('is_completed', true))
    const fetchSpy = jest.spyOn(tasks, '_fetchCount')
    const observer = jest.fn()
    const unsubscribe = subscribeToCount(query, true, observer)
    await tasks.query().fetch()
    expect(observer).toHaveBeenLastCalledWith(0)
    await db.write(() => createTask(tasks, true))
    const t2 = await db.write(() => createTask(tasks, true))
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(observer).toHaveBeenLastCalledWith(2)
    fetchSpy.mockClear()
    await updateTask(t2, () => {
      t2.name = 'hello'
    })
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(fetchSpy).not.toHaveBeenCalled()
    unsubscribe()
  })
})
