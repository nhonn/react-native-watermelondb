import { MockTask, mockDatabase } from '../../__tests__/testModels'
import relation from './index'
import Relation from '../../Relation'
describe('decorators/relation', () => {
  it('creates Relation object', () => {
    const { tasks } = mockDatabase()
    const primary = new MockTask(tasks, {
      project_id: 's1',
    } as any)
    expect(primary.project).toEqual(
      new Relation(primary, 'mock_projects', 'project_id', {
        isImmutable: false,
      })
    )
  })
  it('works on arbitrary objects with asModel', () => {
    const { tasks } = mockDatabase()
    const primary = new MockTask(tasks, {
      project_id: 's1',
    } as any)

    class PrimaryProxy {
      asModel = primary
      @relation('mock_projects', 'project_id')
      project!: any
    }

    const primaryProxy = new PrimaryProxy()
    expect(primaryProxy.project).toEqual(primary.project)
  })
  it('disallows to set relation directly', () => {
    const { tasks } = mockDatabase()
    const primary = new MockTask(tasks, {
      project_id: 's1',
    } as any)
    expect(() => {
      primary.project = 'blah'
    }).toThrow()
  })
  it('caches Relation object', () => {
    const { tasks } = mockDatabase()
    const primary = new MockTask(tasks, {
      project_id: 's1',
    } as any)
    const relation1 = primary.project
    const relation2 = primary.project
    expect(relation1).toBe(relation2)
  })
})