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
  if (!profileColumns.has('version')) {
    database.exec('ALTER TABLE profiles ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)')
  }
  if (!profileColumns.has('update_time')) {
    database.exec('ALTER TABLE profiles ADD COLUMN update_time INTEGER NOT NULL DEFAULT 0 CHECK (update_time >= 0)')
  }
  database.exec("UPDATE profiles SET update_time = unixepoch() WHERE update_time = 0")
  const providerColumns = new Set((database.prepare('PRAGMA table_info(providers)').all() as Array<{ name: string }>).map((column) => column.name))
  if (!providerColumns.has('user_agent')) {
    database.exec('ALTER TABLE providers ADD COLUMN user_agent TEXT')
  }
  if (!providerColumns.has('headers_json')) {
    database.exec('ALTER TABLE providers ADD COLUMN headers_json TEXT')
  }
}
