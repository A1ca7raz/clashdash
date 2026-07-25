import { resolve } from 'node:path'

export type ServerMode = 'local' | 'vercel'
export type DatabaseDialect = 'sqlite' | 'postgres'

export type ServerConfig = {
  mode: ServerMode
  dialect: DatabaseDialect
  port: number
  databasePath?: string
  databaseUrl?: string
  jwtSecret: string
  tokenKey: string
  totpKey: string
  adminUsername: string
  adminPassword: string
  cronSecret?: string
}

export function loadServerConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const mode: ServerMode = environment.VERCEL ? 'vercel' : 'local'
  const dialect = (environment.CLASHDASH_DATABASE_DIALECT ?? (mode === 'vercel' ? 'postgres' : 'sqlite')) as DatabaseDialect
  if (dialect !== 'sqlite' && dialect !== 'postgres') {
    throw new Error('CLASHDASH_DATABASE_DIALECT must be sqlite or postgres')
  }
  if (mode === 'vercel' && dialect === 'sqlite') throw new Error('Vercel mode does not support SQLite')
  const port = Number(environment.PORT ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT must be a valid TCP port')
  const jwtSecret = required(environment, 'CLASHDASH_JWT_SECRET')
  const tokenKey = required(environment, 'CLASHDASH_TOKEN_KEY')
  const common = {
    mode, dialect, port,
    jwtSecret,
    tokenKey,
    totpKey: environment.CLASHDASH_TOTP_KEY || tokenKey,
    adminUsername: environment.CLASHDASH_ADMIN_USERNAME?.trim() || 'admin',
    adminPassword: required(environment, 'CLASHDASH_ADMIN_PASSWORD'),
    ...(environment.CLASHDASH_CRON_SECRET ? { cronSecret: environment.CLASHDASH_CRON_SECRET } : {}),
  }
  if (dialect === 'sqlite') {
    return { ...common, dialect, databasePath: resolve(environment.CLASHDASH_DATABASE_PATH ?? './data/clashdash.sqlite') }
  }
  return { ...common, dialect, databaseUrl: required(environment, 'DATABASE_URL') }
}

function required(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key]
  if (!value) throw new Error(`${key} is required`)
  return value
}
