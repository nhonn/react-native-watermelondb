import React from 'react'
import * as TestRenderer from 'react-test-renderer'
import useDatabase from './useDatabase'
import DatabaseProvider from './DatabaseProvider'
import Database from '../Database'
import { mockDatabase } from '../__tests__/testModels'
describe('useDatabase hook', () => {
  let database: any
  beforeAll(() => {
    database = mockDatabase().db
  })
  test('should use database', () => {
    let current: any
    const Component = () => {
      // oxlint-disable-next-line react/globals
      current = useDatabase()
      return null
    }

    TestRenderer.act(() => {
      TestRenderer.create(
        <DatabaseProvider database={database}>
          <Component />
        </DatabaseProvider>
      )
    })
    expect(current).toBeInstanceOf(Database)
  })
  test('should throw without Provider', () => {
    const Component = () => {
      useDatabase()
      return null
    }

    expect(() =>
      TestRenderer.act(() => {
        TestRenderer.create(<Component />)
      })
    ).toThrow(
      /Could not find database context, please make sure the component is wrapped in the <DatabaseProvider>/i
    )
  })
})
