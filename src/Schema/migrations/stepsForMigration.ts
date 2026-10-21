import { unnest } from '../../utils/fp'
import type { SchemaMigrations, MigrationStep } from './index'
import './index'
import type { SchemaVersion } from '../index'
import '../index'
export function stepsForMigration({
  migrations: schemaMigrations,
  fromVersion,
  toVersion,
}: {
  migrations: SchemaMigrations
  fromVersion: SchemaVersion
  toVersion: SchemaVersion
}): MigrationStep[] | null | undefined {
  const { sortedMigrations, minVersion, maxVersion } = schemaMigrations

  // see if migrations in this range are available
  if (fromVersion < minVersion || toVersion > maxVersion) {
    return null
  }

  // return steps
  const matchingMigrations = sortedMigrations.filter(
    ({ toVersion: version }) => version > fromVersion && version <= toVersion
  )
  const allSteps = unnest(
    matchingMigrations.map((migration) => migration.steps)
  )
  return allSteps
}
