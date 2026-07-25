import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import type { AppStore } from '../application/ports/app-store.ts'
import { PostgresStore } from '../infrastructure/store/postgres/postgres-store.ts'
import { SqliteStore } from '../infrastructure/store/sqlite/sqlite-store.ts'
import type { ServerConfig } from './config.ts'

export async function openAppStore(config: ServerConfig): Promise<AppStore> {
  if (config.dialect === 'sqlite') {
    if (!config.databasePath) throw new Error('SQLite database path is missing')
    mkdirSync(dirname(config.databasePath), { recursive: true })
    return new SqliteStore(config.databasePath)
  }
  if (!config.databaseUrl) throw new Error('PostgreSQL URL is missing')
  return PostgresStore.open(config.databaseUrl, { max: config.mode === 'vercel' ? 1 : 10 })
}
