import { afterEach, describe, expect, it } from 'vitest'

import { compileProfile } from '../../domain/compiler/profile-compiler.ts'
import { AesSubscriptionTokenCipher } from '../../infrastructure/security/aes-subscription-token-cipher.ts'
import { SqliteStore } from '../../infrastructure/store/sqlite/sqlite-store.ts'
import { demoDataIds, seedDemoData } from './demo-data-seeder.ts'

describe('demo data seeder', () => {
  const stores: SqliteStore[] = []
  afterEach(() => stores.splice(0).forEach((store) => store.close()))

  it('seeds a complete, valid and idempotent demo dataset', async () => {
    const store = new SqliteStore(); stores.push(store)
    const cipher = new AesSubscriptionTokenCipher(Buffer.alloc(32, 7))
    await expect(seedDemoData(store, cipher)).resolves.toMatchObject({
      nodeCount: 4, providerCount: 2, rulePackCount: 1, ruleProviderCount: 1, profileCount: 1,
      subscriptionTokenCreated: true,
    })
    const firstToken = store.getSubscriptionTokenById(demoDataIds.subscriptionToken)
    expect(firstToken).toBeDefined()
    expect(store.listNodes()).toHaveLength(4)
    expect(store.listNodes().filter((node) => node.type === 'provider')).toHaveLength(2)
    expect(store.listProviders()).toHaveLength(2)
    expect(store.listRulePacks()).toHaveLength(1)
    expect(store.listRuleProviders()).toHaveLength(1)

    const resolved = store.getProfile(demoDataIds.profile)
    expect(resolved).toBeDefined()
    if (!resolved) throw new Error('Seeded Profile was not found')
    expect(compileProfile(resolved).diagnostics.filter((item) => item.severity === 'error')).toEqual([])
    expect(compileProfile(resolved).yaml).toContain('Demo · HK Hysteria2')

    await expect(seedDemoData(store, cipher)).resolves.toMatchObject({ subscriptionTokenCreated: false })
    expect(store.listNodes()).toHaveLength(4)
    expect(store.listProviders()).toHaveLength(2)
    expect(store.listRulePacks()).toHaveLength(1)
    expect(store.listRuleProviders()).toHaveLength(1)
    expect(store.listProfiles()).toHaveLength(1)
    expect(store.listSubscriptionTokens()).toHaveLength(1)
    expect(store.getSubscriptionTokenById(demoDataIds.subscriptionToken)).toEqual(firstToken)
  })
})
