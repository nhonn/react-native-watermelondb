/* eslint-disable no-bitwise */
import { NitroModules } from 'react-native-nitro-modules'
import type { NativeDatabaseFactory } from '../../../specs/NativeDatabaseFactory.nitro'

const alphabet =
  '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

let factory: NativeDatabaseFactory | undefined
let randomNumbers = new Uint8Array(0)
let cur = 9999999

export default function nativeRandomId(): string {
  let id = ''
  let len = 0
  let v = 0
  while (len < 16) {
    if (cur < 256) {
      v = randomNumbers[cur]! >> 2
      cur++
      if (v < 62) {
        id += alphabet[v]
        len++
      }
    } else {
      factory ??= NitroModules.createHybridObject<NativeDatabaseFactory>(
        'NativeDatabaseFactory'
      )
      randomNumbers = new Uint8Array(factory.getRandomBytes(256))
      cur = 0
    }
  }

  return id
}
