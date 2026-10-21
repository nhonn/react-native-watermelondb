import { Platform } from 'react-native'
import { describe, expect, it } from 'react-native-harness'
import SQLiteAdapter from 'react-native-watermelondb/adapters/sqlite'
import DatabaseAdapterCompat from 'react-native-watermelondb/adapters/compat'
import commonTests from '../../src/adapters/__tests__/commonTests'
import { testSchema } from '../../src/adapters/__tests__/helpers'
import randomId from 'react-native-watermelondb/utils/common/randomId'

;(globalThis as any).expect = expect

let n = 0

describe('SQLiteAdapter (Nitro)', () => {
  commonTests().forEach(([name, test]: any) => {
    it(name, async () => {
      const dbName = `file:harness${n++}?mode=memory&cache=shared`
      const adapter = new DatabaseAdapterCompat(
        new SQLiteAdapter({ dbName, schema: testSchema })
      )
      await (adapter.underlyingAdapter as any).initializingPromise
      await test(adapter, SQLiteAdapter, { dbName }, Platform.OS)
    })
  })

  it('generates 16-char base62 ids', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      const id = randomId()
      expect(id).toMatch(/^[0-9a-zA-Z]{16}$/)
      ids.add(id)
    }
    expect(ids.size).toBe(1000)
  })
})
