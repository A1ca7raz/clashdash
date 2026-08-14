import { randomUUID } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { createServerContainer } from './container.ts'

function environment(databasePath: string, password: string): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: `sqlite:${databasePath}`,
    CLASHDASH_JWT_SECRET: 'container-test-jwt-secret-at-least-32-bytes',
    CLASHDASH_TOKEN_KEY: Buffer.alloc(32, 8).toString('base64url'),
    CLASHDASH_ADMIN_USERNAME: 'admin',
    CLASHDASH_ADMIN_PASSWORD: password,
  }
}

describe('server container admin bootstrap', () => {
  it('creates the sole admin once and persists later password changes', async () => {
    const databasePath = `/tmp/clashdash-container-${randomUUID()}.sqlite`
    const first = await createServerContainer(environment(databasePath, 'first secure password'))
    await expect(first.services.auth.login('admin', 'first secure password')).resolves.toEqual(expect.any(String))
    await first.services.auth.changePassword('first secure password', '1')
    await first.close()

    const second = await createServerContainer(environment(databasePath, 'replacement password'))
    await expect(second.services.auth.login('admin', '1')).resolves.toEqual(expect.any(String))
    await expect(second.services.auth.login('admin', 'first secure password')).rejects.toThrow('Invalid username or password')
    await expect(second.services.auth.login('admin', 'replacement password')).rejects.toThrow('Invalid username or password')
    await second.close()
  })
})
