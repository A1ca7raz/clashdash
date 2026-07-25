import { describe, expect, it } from 'vitest'

import { loadServerConfig } from './config.ts'

const secrets = {
  CLASHDASH_JWT_SECRET: 'j'.repeat(32),
  CLASHDASH_TOKEN_KEY: Buffer.alloc(32, 2).toString('base64url'),
  CLASHDASH_ADMIN_PASSWORD: 'correct horse battery staple',
}

describe('server config', () => {
  it('defaults local mode to SQLite', () => {
    expect(loadServerConfig({ ...secrets, CLASHDASH_DATABASE_PATH: './test.sqlite' })).toMatchObject({
      mode: 'local', dialect: 'sqlite', port: 3000,
      adminUsername: 'admin', totpKey: secrets.CLASHDASH_TOKEN_KEY,
    })
  })

  it('allows a dedicated TOTP encryption key', () => {
    const totpKey = Buffer.alloc(32, 3).toString('base64url')
    expect(loadServerConfig({ ...secrets, CLASHDASH_TOTP_KEY: totpKey }).totpKey).toBe(totpKey)
  })

  it('defaults Vercel mode to PostgreSQL and rejects Vercel SQLite', () => {
    expect(loadServerConfig({ ...secrets, VERCEL: '1', DATABASE_URL: 'postgres://example' })).toMatchObject({
      mode: 'vercel', dialect: 'postgres', databaseUrl: 'postgres://example',
    })
    expect(() => loadServerConfig({ ...secrets, VERCEL: '1', CLASHDASH_DATABASE_DIALECT: 'sqlite' }))
      .toThrow('does not support SQLite')
  })

  it('requires production secrets and a PostgreSQL URL', () => {
    expect(() => loadServerConfig({})).toThrow('CLASHDASH_JWT_SECRET is required')
    expect(() => loadServerConfig({ ...secrets, CLASHDASH_DATABASE_DIALECT: 'postgres' })).toThrow('DATABASE_URL is required')
  })

  it('requires the initial password from the environment', () => {
    const { CLASHDASH_ADMIN_PASSWORD: _password, ...withoutPassword } = secrets
    expect(() => loadServerConfig(withoutPassword)).toThrow('CLASHDASH_ADMIN_PASSWORD is required')
  })
})
