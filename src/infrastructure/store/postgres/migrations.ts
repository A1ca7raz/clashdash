import type postgres from 'postgres'

import { postgresSchema } from './schema.ts'

export async function migratePostgres(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(postgresSchema)
}
