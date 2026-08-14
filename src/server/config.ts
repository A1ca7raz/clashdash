import { resolve } from 'node:path'

export type ServerMode = 'local' | 'vercel'
export type DatabaseType = 'sqlite' | 'postgres'

export type ServerConfig = {
  mode: ServerMode
  port: number
  databaseUrl: string
  jwtSecret: string
  tokenKey: string
  totpKey: string
  adminUsername: string
  adminPassword: string
  cronSecret?: string
}

export function loadServerConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const mode: ServerMode = environment.VERCEL ? 'vercel' : 'local'
  const databaseUrl = environment.DATABASE_URL
    ?? (mode === 'local' ? 'sqlite:./data/clashdash.sqlite' : required(environment, 'DATABASE_URL'))
  const type = databaseType(databaseUrl)
  if (mode === 'vercel' && type === 'sqlite') throw new Error('Vercel mode requires a PostgreSQL DATABASE_URL')
  const port = mode === 'local' ? localPort(environment.PORT) : 3000
  const jwtSecret = required(environment, 'CLASHDASH_JWT_SECRET')
  const tokenKey = required(environment, 'CLASHDASH_TOKEN_KEY')
  const common = {
    mode, port, databaseUrl,
    jwtSecret,
    tokenKey,
    totpKey: environment.CLASHDASH_TOTP_KEY || tokenKey,
    adminUsername: environment.CLASHDASH_ADMIN_USERNAME?.trim() || 'admin',
    adminPassword: required(environment, 'CLASHDASH_ADMIN_PASSWORD'),
    ...(environment.CLASHDASH_CRON_SECRET ? { cronSecret: environment.CLASHDASH_CRON_SECRET } : {}),
  }
  return common
}

function localPort(value: string | undefined): number {
  const port = Number(value ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT must be a valid TCP port')
  return port
}

export function databaseType(value: string): DatabaseType {
  const url = parseDatabaseUrl(value)
  return url.protocol === 'sqlite:' ? 'sqlite' : 'postgres'
}

export function sqliteDatabasePath(value: string): string {
  const url = parseDatabaseUrl(value)
  if (url.protocol !== 'sqlite:') throw new Error('DATABASE_URL is not a SQLite URL')
  return resolve(decodeURIComponent(url.pathname))
}

function parseDatabaseUrl(value: string): URL {
  let url: URL
  try { url = new URL(value) }
  catch { throw new Error('DATABASE_URL must be a valid sqlite:, postgres:, or postgresql: URL') }
  if (url.protocol === 'sqlite:') {
    if (url.host || !url.pathname) {
      throw new Error('SQLite DATABASE_URL must use sqlite:./path or sqlite:/absolute/path')
    }
    try { decodeURIComponent(url.pathname) }
    catch { throw new Error('SQLite DATABASE_URL contains an invalid encoded path') }
    return url
  }
  if (url.protocol === 'postgres:' || url.protocol === 'postgresql:') return url
  throw new Error('DATABASE_URL must use sqlite:, postgres:, or postgresql:')
}

function required(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key]
  if (!value) throw new Error(`${key} is required`)
  return value
}
