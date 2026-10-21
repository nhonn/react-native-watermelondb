import fs from 'fs'
import { testSchema } from '../__tests__/helpers'
import commonTests from '../__tests__/commonTests'
import SqliteAdapter from './index'
import DatabaseAdapterCompat from '../compat'

describe.each([false, true])('SQLiteAdapter (synchronous: %s)', (synchronous) => {
  // NOTE: one test uses a .tmp/xx path, so the directory must exist
  fs.mkdirSync('.tmp', { recursive: true })

  commonTests().forEach((testCase: any) => {
    const [name, test] = testCase

    // eslint-disable-next-line jest/valid-title
    it(name, async () => {
      const dbName = `file:test${Math.random()}?mode=memory&cache=shared`
      const extraAdapterOptions = { dbName, synchronous }
      const adapter = new SqliteAdapter({
        dbName,
        schema: testSchema,
        synchronous,
      })

      await adapter.initializingPromise
      await test(
        new DatabaseAdapterCompat(adapter),
        SqliteAdapter,
        extraAdapterOptions,
        'node'
      )
    })
  })
})
