import React from 'react'
import * as TestRenderer from 'react-test-renderer'
import Database from '../Database'
import { mockDatabase } from '../__tests__/testModels'
import DatabaseProvider from './DatabaseProvider'
import { DatabaseConsumer } from './DatabaseContext'
import withDatabase from './withDatabase'

// Simple mock component
function MockComponent(_props: any) {
  return <span />
}

// React 19 renders asynchronously; act() flushes the render and rethrows render errors
const render = (element: React.ReactElement) => {
  let renderer!: TestRenderer.ReactTestRenderer
  TestRenderer.act(() => {
    renderer = TestRenderer.create(element)
  })
  return { renderer }
}

describe('DatabaseProvider', () => {
  let database: any
  beforeAll(() => {
    database = mockDatabase().db
  })
  it('throws if no database or adapter supplied', () => {
    expect(() =>
      render(
        <DatabaseProvider {...({} as any)}>
          <p />
        </DatabaseProvider>
      )
    ).toThrow(/You must supply a valid database/i)
    expect(() =>
      render(
        <DatabaseProvider database={{ fake: 'db' } as any}>
          <p />
        </DatabaseProvider>
      )
    ).toThrow(/You must supply a valid database/i)
  })
  it('passes database to consumer', () => {
    const { renderer: instance } = render(
      <DatabaseProvider database={database}>
        <DatabaseConsumer>
          {(db) => <MockComponent database={db} />}
        </DatabaseConsumer>
      </DatabaseProvider>
    )
    const component = instance.root.find(MockComponent as any)
    expect(component.props.database).toBeInstanceOf(Database)
  })
  describe('withDatabase', () => {
    test('should pass the database from the context to the consumer', () => {
      const Child = withDatabase(MockComponent)
      const { renderer: instance } = render(
        <DatabaseProvider database={database}>
          <Child />
        </DatabaseProvider>
      )
      const component = instance.root.find(MockComponent as any)
      expect(component.props.database).toBeInstanceOf(Database)
    })
  })
})
