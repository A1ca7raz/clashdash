import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import type { AppStore } from '../application/ports/app-store.ts'
import { PostgresStore } from '../infrastructure/store/postgres/postgres-store.ts'
import { SqliteStore } from '../infrastructure/store/sqlite/sqlite-store.ts'
import { databaseType, sqliteDatabasePath, type ServerConfig } from './config.ts'

export async function openAppStore(config: ServerConfig): Promise<AppStore> {
  if (databaseType(config.databaseUrl) === 'sqlite') {
    const databasePath = sqliteDatabasePath(config.databaseUrl)
    mkdirSync(dirname(databasePath), { recursive: true })
    return new SqliteStore(databasePath)
  }
  return PostgresStore.open(config.databaseUrl, { max: config.mode === 'vercel' ? 1 : 10 })
}
