import { NitroModules } from 'react-native-nitro-modules'
import type { Watermelondb as WatermelondbSpec } from './specs/watermelondb.nitro'

export const Watermelondb =
  NitroModules.createHybridObject<WatermelondbSpec>('Watermelondb')