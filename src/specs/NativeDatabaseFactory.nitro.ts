import type { HybridObject } from 'react-native-nitro-modules'
import type { NativeDatabase } from './NativeDatabase.nitro'

export interface NativeDatabaseFactory
  extends HybridObject<{ ios: 'c++'; android: 'c++' }> {
  createDatabase(path: string, usesExclusiveLocking: boolean): NativeDatabase
  getRandomBytes(count: number): ArrayBuffer
}
