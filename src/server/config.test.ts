import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { databaseType, loadServerConfig, sqliteDatabasePath } from './config.ts'

const secrets = {
  CLASHDASH_JWT_SECRET: 'j'.repeat(32),
  CLASHDASH_TOKEN_KEY: Buffer.alloc(32, 2).toString('base64url'),
  CLASHDASH_ADMIN_PASSWORD: 'correct horse battery staple',
}

describe('server config', () => {
  it('defaults local mode to SQLite', () => {
    expect(loadServerConfig(secrets)).toMatchObject({
      mode: 'local', databaseUrl: 'sqlite:./data/clashdash.sqlite', port: 3000,
      adminUsername: 'admin', totpKey: secrets.CLASHDASH_TOKEN_KEY,
    })
  })

  it('uses SQLite and PostgreSQL DATABASE_URL protocols', () => {
    expect(databaseType('sqlite:./test.sqlite')).toBe('sqlite')
    expect(sqliteDatabasePath('sqlite:./test.sqlite')).toBe(resolve('./test.sqlite'))
    expect(databaseType('postgres://example/database')).toBe('postgres')
    expect(databaseType('postgresql://example/database')).toBe('postgres')
    expect(loadServerConfig({ ...secrets, DATABASE_URL: 'postgres://example' })).toMatchObject({
      mode: 'local', databaseUrl: 'postgres://example',
    })
  })

  it('rejects unsupported and malformed database URLs', () => {
    expect(() => loadServerConfig({ ...secrets, DATABASE_URL: 'mysql://example/database' }))
      .toThrow('must use sqlite:, postgres:, or postgresql:')
    expect(() => loadServerConfig({ ...secrets, DATABASE_URL: 'sqlite:' }))
      .toThrow('SQLite DATABASE_URL must use')
  })

  it('allows a dedicated TOTP encryption key', () => {
    const totpKey = Buffer.alloc(32, 3).toString('base64url')
    expect(loadServerConfig({ ...secrets, CLASHDASH_TOTP_KEY: totpKey }).totpKey).toBe(totpKey)
  })

  it('requires PostgreSQL in Vercel mode', () => {
    expect(loadServerConfig({ ...secrets, VERCEL: '1', DATABASE_URL: 'postgres://example' })).toMatchObject({
      mode: 'vercel', databaseUrl: 'postgres://example',
    })
    expect(() => loadServerConfig({ ...secrets, VERCEL: '1', DATABASE_URL: 'sqlite:./vercel.sqlite' }))
      .toThrow('requires a PostgreSQL DATABASE_URL')
  })

  it('requires production secrets and a PostgreSQL URL', () => {
    expect(() => loadServerConfig({})).toThrow('CLASHDASH_JWT_SECRET is required')
    expect(() => loadServerConfig({ ...secrets, VERCEL: '1' })).toThrow('DATABASE_URL is required')
  })

  it('requires the initial password from the environment', () => {
    const { CLASHDASH_ADMIN_PASSWORD: _password, ...withoutPassword } = secrets
    expect(() => loadServerConfig(withoutPassword)).toThrow('CLASHDASH_ADMIN_PASSWORD is required')
  })
})
