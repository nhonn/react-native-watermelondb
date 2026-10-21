import type { HybridObject } from 'react-native-nitro-modules'

export interface DatabasePaths
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  readonly databaseDirectory: string
}
