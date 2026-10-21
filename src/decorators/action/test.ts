import { MockTask, mockDatabase } from '../../__tests__/testModels'
import { writer, reader } from './index'

class MockTaskExtended extends MockTask {
  @reader
  async returnArgs(a: any, b: any, ...c: any[]) {
    return [this.name, a, b, c]
  }

  @writer
  async nested(...args: any[]) {
    // @ts-expect-error ported Flow test code is not type-safe here
    this.callWriter(() => this.returnArgs('sub', ...args))
    this.callWriter(() => this.db.write(async () => 42))
    // @ts-expect-error ported Flow test code is not type-safe here
    return this.callReader(() => this.returnArgs('sub', ...args))
  }
}

describe('@writer', () => {
  it('calls db.writer() and passes arguments correctly', async () => {
    const { database, tasks } = mockDatabase()
    const record = new MockTaskExtended(tasks, {
      name: 'test',
    } as any)
    const spy = jest.spyOn(database, 'read')
    expect(await record.returnArgs(1, 2, 3, 4)).toEqual(['test', 1, 2, [3, 4]])
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBeInstanceOf(Function)
    expect(spy.mock.calls[0][1]).toBe('mock_tasks.returnArgs')
  })
  it('can call subactions using this.callReader/callWriter', async () => {
    const { tasks } = mockDatabase()
    const record = new MockTaskExtended(tasks, {
      name: 'test',
    } as any)
    expect(await record.nested(1, 2, 3, 4)).toEqual([
      'test',
      'sub',
      1,
      [2, 3, 4],
    ])
  })
  it('works with arbitrary classes', async () => {
    const { database } = mockDatabase()
    const spy = jest.spyOn(database, 'read')

    class TestClass {
      database!: any

      @reader
      async test() {
        return 42
      }
    }

    const test = new TestClass()
    test.database = database
    expect(await test.test()).toEqual(42)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})