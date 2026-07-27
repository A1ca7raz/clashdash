import { randomUUID } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import type { Profile } from '../../src/domain/models/profile.ts'
import type { PassthroughProvider } from '../../src/domain/models/provider.ts'
import type { RulePack } from '../../src/domain/models/rule.ts'
import { PostgresStore } from '../../src/infrastructure/store/postgres/postgres-store.ts'

const connectionString = process.env.TEST_POSTGRES_URL

describe.skipIf(!connectionString)('PostgresStore contract', () => {
  it('round-trips the same aggregate semantics as SQLite', async () => {
    if (!connectionString) throw new Error('TEST_POSTGRES_URL is missing')
    const store = await PostgresStore.open(connectionString, { max: 1, prepare: false })
    const suffix = randomUUID()
    const provider: PassthroughProvider = {
      type: 'passthrough', id: `provider-${suffix}`, name: `Provider ${suffix}`, url: 'https://example.com',
      interval: 3600, override: { skipCertVerify: true }, config: {},
    }
    const node = {
      type: 'userdefined' as const, id: `node-${suffix}`, name: `Node ${suffix}`, tags: ['postgres'],
      proxy: { type: 'ss', server: 'example.com', port: 443, cipher: 'aes-128-gcm', password: 'secret' },
    }
    const rulePack: RulePack = {
      id: `pack-${suffix}`, name: `Pack ${suffix}`,
      rules: [{ type: 'DOMAIN-SUFFIX', parameters: ['example.com'], policy: 'DIRECT' }],
    }
    const profile: Profile = {
      id: `profile-${suffix}`, name: `Profile ${suffix}`, tags: [], generalConfig: { mode: 'rule' },
      selectedNodes: [node], listeners: [], proxyGroups: [],
      ruleEntries: [{ type: 'rulePack', rulePack }], ruleProviders: [], passthroughProviders: [provider],
    }
    try {
      await store.saveProvider(provider)
      await store.saveUserDefinedNode(node)
      await store.saveRulePack(rulePack)
      await store.saveProfile(profile)
      expect(await store.getProfile(profile.id)).toEqual({ profile, missingReferences: [] })
      await expect(store.getProfileUpdateInfo(profile.id)).resolves.toMatchObject({
        version: 1,
        updateTime: expect.any(Number),
      })
      await store.saveProfile(profile)
      await expect(store.getProfileUpdateInfo(profile.id)).resolves.toMatchObject({
        version: 2,
        updateTime: expect.any(Number),
      })
      await store.saveSubscriptionToken({
        id: `token-${suffix}`, profileId: profile.id, tokenHash: `hash-${suffix}`, encryptedToken: 'encrypted',
      })
      await store.deleteProfile(profile.id)
      expect(await store.listSubscriptionTokens(profile.id)).toEqual([])
    } finally {
      await store.deleteUserDefinedNode(node.id)
      await store.deleteProvider(provider.id)
      await store.deleteRulePack(rulePack.id)
      await store.close()
    }
  })
})
