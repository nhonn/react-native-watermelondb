export type InitializeCode = 'ok' | 'schema_needed' | 'migrations_needed'
export interface InitializeResult {
  code: InitializeCode
  databaseVersion?: number
}
