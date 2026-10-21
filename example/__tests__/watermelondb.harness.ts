import { describe, it, expect } from 'react-native-harness'
import { Watermelondb } from 'react-native-watermelondb'

describe('Watermelondb', () => {
  it('calls the native implementation', () => {
    expect(Watermelondb.sum(1, 2)).toBe(3)
  })
})
