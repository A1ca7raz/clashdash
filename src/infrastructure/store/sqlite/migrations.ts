import type Database from 'better-sqlite3'

import { sqliteSchema } from './schema.ts'

export function migrateSqlite(database: Database.Database): void {
  database.exec(sqliteSchema)
  const columns = new Set((database.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map((column) => column.name))
  if (!columns.has('totp_secret_encrypted')) {
    database.exec('ALTER TABLE users ADD COLUMN totp_secret_encrypted TEXT')
  }
  if (!columns.has('totp_enabled')) {
    database.exec('ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0 CHECK (totp_enabled IN (0, 1))')
  }
  const profileColumns = new Set((database.prepare('PRAGMA table_info(profiles)').all() as Array<{ name: string }>).map((column) => column.name))
  if (!profileColumns.has('rule_provider_ids_json')) {
    database.exec("ALTER TABLE profiles ADD COLUMN rule_provider_ids_json TEXT NOT NULL DEFAULT '[]'")
  }
}
