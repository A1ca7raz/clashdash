import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ConflictError } from '../../../application/errors.ts'
import type { Profile } from '../../../domain/models/profile.ts'
import type { ImportProvider, PassthroughProvider } from '../../../domain/models/provider.ts'
import type { RuleProvider } from '../../../domain/models/rule-provider.ts'
import type { RulePack } from '../../../domain/models/rule.ts'
import { SqliteStore } from './sqlite-store.ts'

describe('SqliteStore', () => {
  let store: SqliteStore

  beforeEach(() => { store = new SqliteStore() })
  afterEach(() => { store.close() })

  it('initializes exactly one user and round-trips aggregates', () => {
    expect(store.initializeUser({ username: 'admin', passwordHash: 'hash-1', totpEnabled: false })).toBe(true)
    expect(store.initializeUser({ username: 'other', passwordHash: 'hash-2', totpEnabled: false })).toBe(false)
    expect(store.getUser()).toEqual({ username: 'admin', passwordHash: 'hash-1', totpEnabled: false })
    store.saveUser({
      username: 'admin', passwordHash: 'hash-updated', totpEnabled: true, totpSecretEncrypted: 'encrypted-secret',
    })
    expect(store.getUser()).toEqual({
      username: 'admin', passwordHash: 'hash-updated', totpEnabled: true, totpSecretEncrypted: 'encrypted-secret',
    })

    const provider: PassthroughProvider = {
      type: 'passthrough', id: 'provider-1', name: 'Remote', url: 'https://example.com/sub', interval: 3600,
      excludeFilter: 'Expired', override: { udpOverTcp: true }, config: { healthCheck: { enable: true } },
    }
    const rulePack: RulePack = {
      id: 'pack-1', name: 'Private', rules: [{ type: 'DOMAIN-SUFFIX', parameters: ['internal'], policy: 'DIRECT' }],
    }
    const node = {
      type: 'userdefined' as const, id: 'node-1', name: 'Node 1', tags: ['primary'],
      proxy: { type: 'ss', server: 'example.com', port: 443, cipher: 'aes-128-gcm', password: 'secret' },
      listenerTemplate: { type: 'tunnel', port: 8080 },
    }
    store.saveProvider(provider)
    store.saveRulePack(rulePack)
    store.saveUserDefinedNode(node)

    const profile: Profile = {
      id: 'profile-1', name: 'Default', tags: ['client'], note: 'note', generalConfig: { mode: 'rule' },
      selectedNodes: [node],
      listeners: [
        { type: 'derived', name: 'Inbound', node },
        { type: 'userdefined', listener: { name: 'Mixed', type: 'mixed', port: 7890 } },
      ],
      proxyGroups: [{ name: 'Auto', type: 'select', proxies: ['Node 1'] }],
      ruleEntries: [
        { type: 'rule', rule: { type: 'MATCH', parameters: [], policy: 'Auto' } },
        { type: 'rulePack', rulePack },
      ],
      ruleProviders: [],
      passthroughProviders: [provider],
    }
    store.saveProfile(profile)

    expect(store.getProvider(provider.id)).toEqual(provider)
    expect(store.getRulePack(rulePack.id)).toEqual(rulePack)
    expect(store.getNode(node.id)).toEqual(node)
    expect(store.getProfile(profile.id)).toEqual({ profile, missingReferences: [] })
    expect(store.profileIdsReferencingNode(node.id)).toEqual([profile.id])
    expect(store.profileIdsReferencingProvider(provider.id)).toEqual([profile.id])
    expect(store.profileIdsReferencingRulePack(rulePack.id)).toEqual([profile.id])

    const createdInfo = store.getProfileUpdateInfo(profile.id)
    expect(createdInfo).toMatchObject({ version: 1 })
    expect(createdInfo?.updateTime).toEqual(expect.any(Number))
    store.saveProfile(profile)
    expect(store.getProfileUpdateInfo(profile.id)).toMatchObject({
      version: 2,
      updateTime: expect.any(Number),
    })
  })

  it('automatically removes missing references when a Profile is read', () => {
    const profile: Profile = {
      id: 'profile-1', name: 'Broken', tags: [], generalConfig: {}, selectedNodes: [], listeners: [],
      proxyGroups: [], ruleEntries: [], ruleProviders: [], passthroughProviders: [],
    }
    const missing = [
      { area: 'selectedNodes' as const, position: 0, id: 'gone-node', displayName: 'Old Node' },
      { area: 'ruleEntries' as const, position: 0, id: 'gone-pack', displayName: 'Old Pack' },
    ]
    store.saveProfile(profile, missing)
    expect(store.profileIdsReferencingNode('gone-node')).toEqual([profile.id])
    expect(store.profileIdsReferencingRulePack('gone-pack')).toEqual([profile.id])

    expect(store.listProfiles()).toEqual([{ profile, missingReferences: [] }])
    expect(store.profileIdsReferencingNode('gone-node')).toEqual([])
    expect(store.profileIdsReferencingRulePack('gone-pack')).toEqual([])

    store.saveProfile(profile, missing)
    expect(store.getProfile(profile.id)).toEqual({ profile, missingReferences: [] })
    expect(store.profileIdsReferencingNode('gone-node')).toEqual([])
    expect(store.profileIdsReferencingRulePack('gone-pack')).toEqual([])
  })

  it('replaces provider nodes atomically and cascades provider deletion', () => {
    const provider: ImportProvider = {
      type: 'import', id: 'import-1', name: 'Airport', url: 'https://example.com', interval: 3600,
      subscriptionFormat: 'clash', userAgent: 'CustomClient/2.0',
      headers: { Authorization: ['Bearer secret'], 'X-Client': ['ClashDash'] },
    }
    store.saveProvider(provider)
    expect(store.getProvider(provider.id)).toEqual(provider)
    store.replaceProviderNodes(provider.id, [{
      upstreamKey: 'upstream-a',
      node: { type: 'provider', id: 'node-a', name: 'A', tags: [], proxy: { type: 'ss' }, provider },
    }])
    expect(store.listProviderNodeStates(provider.id)).toMatchObject([{ upstreamKey: 'upstream-a', node: { id: 'node-a' } }])
    expect(() => store.replaceProviderNodes(provider.id, [
      { upstreamKey: 'duplicate', node: { type: 'provider', id: 'node-b', name: 'B', tags: [], proxy: { type: 'ss' }, provider } },
      { upstreamKey: 'duplicate', node: { type: 'provider', id: 'node-c', name: 'C', tags: [], proxy: { type: 'ss' }, provider } },
    ])).toThrow(ConflictError)
    expect(store.listProviderNodeStates(provider.id).map((item) => item.node.id)).toEqual(['node-a'])
    store.deleteProvider(provider.id)
    expect(store.getNode('node-a')).toBeUndefined()
  })

  it('rejects deleting an in-use RulePack and cascades Profile tokens', () => {
    const pack: RulePack = { id: 'pack-1', name: 'Pack', rules: [] }
    store.saveRulePack(pack)
    store.saveProfile({
      id: 'profile-1', name: 'Profile', tags: [], generalConfig: {}, selectedNodes: [], listeners: [],
      proxyGroups: [], ruleEntries: [{ type: 'rulePack', rulePack: pack }], ruleProviders: [], passthroughProviders: [],
    })
    expect(() => store.deleteRulePack(pack.id)).toThrow(ConflictError)
    store.saveSubscriptionToken({
      id: 'token-1', profileId: 'profile-1', tokenHash: 'hash', encryptedToken: 'encrypted',
    })
    expect(store.getSubscriptionTokenByHash('hash')?.id).toBe('token-1')
    store.deleteProfile('profile-1')
    expect(store.listSubscriptionTokens()).toEqual([])
  })

  it('renames Rule Provider references atomically and rejects deleting referenced providers', () => {
    const ruleProvider: RuleProvider = {
      id: 'rule-provider-1', name: 'OldRules',
      config: { type: 'inline', behavior: 'domain', payload: ['example.com'] },
    }
    const pack: RulePack = {
      id: 'pack-1', name: 'Pack',
      rules: [{ type: 'RULE-SET', parameters: [ruleProvider.name], policy: 'REJECT' }],
    }
    const profile: Profile = {
      id: 'profile-1', name: 'Profile', tags: [], generalConfig: {}, selectedNodes: [], listeners: [],
      proxyGroups: [],
      ruleEntries: [{
        type: 'rule', rule: { type: 'RULE-SET', parameters: [ruleProvider.name], policy: 'DIRECT' },
      }],
      ruleProviders: [ruleProvider], passthroughProviders: [],
    }
    store.saveRuleProvider(ruleProvider)
    store.saveRulePack(pack)
    store.saveProfile(profile)
    expect(store.getProfileUpdateInfo(profile.id)?.version).toBe(1)

    const renamed = { ...ruleProvider, name: 'NewRules' }
    store.saveRuleProvider(renamed, ruleProvider.name)
    expect(store.getProfileUpdateInfo(profile.id)?.version).toBe(2)
    expect(store.getRulePack(pack.id)?.rules[0]?.parameters).toEqual(['NewRules'])
    expect(store.getProfile(profile.id)?.profile).toMatchObject({
      ruleProviders: [{ id: ruleProvider.id, name: 'NewRules' }],
      ruleEntries: [{ type: 'rule', rule: { parameters: ['NewRules'] } }],
    })
    expect(() => store.deleteRuleProvider(ruleProvider.id)).toThrow(ConflictError)

    store.saveRulePack({ ...pack, rules: [] })
    store.saveProfile({ ...profile, ruleEntries: [], ruleProviders: [] })
    expect(store.deleteRuleProvider(ruleProvider.id)).toBe(true)
  })

  it('rolls back a Rule Provider rename when its new name conflicts', () => {
    const first: RuleProvider = {
      id: 'first', name: 'First', config: { type: 'inline', behavior: 'domain', payload: ['first.example'] },
    }
    const second: RuleProvider = {
      id: 'second', name: 'Second', config: { type: 'inline', behavior: 'domain', payload: ['second.example'] },
    }
    const pack: RulePack = {
      id: 'pack', name: 'Pack', rules: [{ type: 'RULE-SET', parameters: ['First'], policy: 'DIRECT' }],
    }
    store.saveRuleProvider(first)
    store.saveRuleProvider(second)
    store.saveRulePack(pack)

    expect(() => store.saveRuleProvider({ ...first, name: second.name }, first.name)).toThrow(ConflictError)
    expect(store.getRuleProvider(first.id)?.name).toBe('First')
    expect(store.getRulePack(pack.id)?.rules[0]?.parameters).toEqual(['First'])
  })
})
