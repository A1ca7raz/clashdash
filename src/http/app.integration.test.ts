import { afterEach, describe, expect, it } from 'vitest'

import type { ApplicationServices } from '../application/services.ts'
import { AuthService } from '../application/auth/auth-service.ts'
import { NodeService } from '../application/nodes/node-service.ts'
import { ProfileService } from '../application/profiles/profile-service.ts'
import { ProviderRefreshService } from '../application/providers/provider-refresh-service.ts'
import { ProviderService } from '../application/providers/provider-service.ts'
import { RulePackService } from '../application/rule-packs/rule-pack-service.ts'
import { RuleProviderService } from '../application/rule-providers/rule-provider-service.ts'
import { SubscriptionService } from '../application/subscriptions/subscription-service.ts'
import { SubscriptionParserRegistry } from '../shared/subscription-parser/index.ts'
import { AesSubscriptionTokenCipher } from '../infrastructure/security/aes-subscription-token-cipher.ts'
import { JoseAdminTokenService } from '../infrastructure/security/jose-admin-token-service.ts'
import { Rfc6238TotpService } from '../infrastructure/security/rfc6238-totp-service.ts'
import { ScryptPasswordHasher } from '../infrastructure/security/scrypt-password-hasher.ts'
import { SqliteStore } from '../infrastructure/store/sqlite/sqlite-store.ts'
import { createApp } from './app.ts'
import type { RuleProvider } from '../domain/models/rule-provider.ts'
import type { RulePack } from '../domain/models/rule.ts'

describe('HTTP app', () => {
  const stores: SqliteStore[] = []
  afterEach(() => stores.splice(0).forEach((store) => store.close()))

  it('separates admin JWT authentication from public subscription tokens', async () => {
    const store = new SqliteStore(); stores.push(store)
    const parsers = new SubscriptionParserRegistry()
    const refresh = new ProviderRefreshService(store, { fetch: async () => '' }, parsers)
    const passwordHasher = new ScryptPasswordHasher()
    store.initializeUser({
      username: 'admin', passwordHash: await passwordHasher.hash('correct horse battery staple'), totpEnabled: false,
    })
    const secretCipher = new AesSubscriptionTokenCipher(Buffer.alloc(32, 4))
    const totp = new Rfc6238TotpService(() => 59_000)
    const services: ApplicationServices = {
      auth: new AuthService(store, passwordHasher, new JoseAdminTokenService('j'.repeat(32)), totp, secretCipher),
      nodes: new NodeService(store, parsers),
      providers: new ProviderService(store, refresh),
      rulePacks: new RulePackService(store),
      ruleProviders: new RuleProviderService(store),
      profiles: new ProfileService(store, () => 'profile-1'),
      subscriptions: new SubscriptionService(store, secretCipher, () => 'token-1'),
    }
    const app = createApp(services)

    expect((await app.request('/api/nodes')).status).toBe(401)
    const login = await app.request('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'correct horse battery staple' }),
    })
    const { token: adminToken } = await login.json() as { token: string }
    const adminHeaders = { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' }
    expect((await app.request('/api/auth/initialize', { method: 'POST', headers: adminHeaders })).status).toBe(404)

    const security = await app.request('/api/account/security', { headers: adminHeaders })
    await expect(security.json()).resolves.toMatchObject({ totpEnabled: false, totpSetupPending: false })
    const setupResponse = await app.request('/api/account/totp/setup', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ currentPassword: 'correct horse battery staple' }),
    })
    expect(setupResponse.status).toBe(200)
    expect(setupResponse.headers.get('cache-control')).toBe('no-store')
    const setup = await setupResponse.json() as { secret: string; qrCodeDataUrl: string }
    expect(setup.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/)
    const totpCode = totp.generateCode(setup.secret)
    expect((await app.request('/api/account/totp/confirm', {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ code: totpCode }),
    })).status).toBe(204)

    const missingTotp = await app.request('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'correct horse battery staple' }),
    })
    expect(missingTotp.status).toBe(401)
    await expect(missingTotp.json()).resolves.toMatchObject({ error: { code: 'TOTP_REQUIRED' } })
    expect((await app.request('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'correct horse battery staple', totpCode }),
    })).status).toBe(200)
    expect((await app.request('/api/account/password', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ currentPassword: 'correct horse battery staple', newPassword: '1', totpCode }),
    })).status).toBe(204)
    expect((await app.request('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: '1', totpCode }),
    })).status).toBe(200)

    const createRuleProvider = await app.request('/api/rule-providers', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({
        name: 'ManagedRules',
        config: { type: 'inline', behavior: 'domain', payload: ['example.com'] },
      }),
    })
    expect(createRuleProvider.status).toBe(201)
    const ruleProvider = await createRuleProvider.json() as RuleProvider
    const createRulePack = await app.request('/api/rule-packs', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({
        name: 'Managed Pack',
        rules: [{ type: 'RULE-SET', parameters: [ruleProvider.name], policy: 'REJECT' }],
      }),
    })
    expect(createRulePack.status).toBe(201)
    const rulePack = await createRulePack.json() as RulePack
    const renameRuleProvider = await app.request(`/api/rule-providers/${ruleProvider.id}`, {
      method: 'PUT', headers: adminHeaders,
      body: JSON.stringify({ name: 'RenamedRules', config: ruleProvider.config }),
    })
    expect(renameRuleProvider.status).toBe(200)
    const renamedRuleProvider = await renameRuleProvider.json() as RuleProvider
    const reloadedPack = await app.request(`/api/rule-packs/${rulePack.id}`, { headers: adminHeaders })
    expect((await reloadedPack.json() as RulePack).rules[0]?.parameters).toEqual(['RenamedRules'])
    expect((await app.request(`/api/rule-providers/${ruleProvider.id}`, {
      method: 'DELETE', headers: adminHeaders,
    })).status).toBe(409)

    const profileResponse = await app.request('/api/profiles', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({
        name: 'Default', tags: [], generalConfig: { mode: 'rule' }, selectedNodes: [], listeners: [],
        proxyGroups: [], ruleEntries: [
          { type: 'rule', rule: { type: 'RULE-SET', parameters: [renamedRuleProvider.name], policy: 'REJECT' } },
          { type: 'rule', rule: { type: 'MATCH', parameters: [], policy: 'DIRECT' } },
        ],
        ruleProviders: [renamedRuleProvider],
        passthroughProviders: [],
      }),
    })
    expect(profileResponse.status).toBe(201)
    const issue = await app.request('/api/profiles/profile-1/tokens', {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ note: 'phone' }),
    })
    expect(issue.status).toBe(201)
    const issued = await issue.json() as { token: string; subscriptionUrl: string }
    expect(issued.token).toMatch(/^[a-z0-9_-]{32}$/)
    const subscriptionUrl = new URL(issued.subscriptionUrl)
    expect(subscriptionUrl.pathname).toBe('/api/profile')
    expect(subscriptionUrl.searchParams.get('apikey')).toBe(issued.token)

    const subscription = await app.request(`${subscriptionUrl.pathname}${subscriptionUrl.search}`)
    expect(subscription.status).toBe(200)
    expect(subscription.headers.get('content-type')).toContain('text/yaml')
    const subscriptionYaml = await subscription.text()
    expect(subscriptionYaml).toContain('rule-providers:')
    expect(subscriptionYaml).toContain('RULE-SET,RenamedRules,REJECT')
    expect(subscriptionYaml).toContain('MATCH,DIRECT')
    expect((await app.request(`/api/profile?apikey=invalid`)).status).toBe(404)

    const tokens = await app.request('/api/profiles/profile-1/tokens', { headers: adminHeaders })
    expect((await tokens.json() as Array<{ token: string }>)[0]?.token).toBe(issued.token)
    expect((await app.request('/api/nodes', { headers: { authorization: `Bearer ${issued.token}` } })).status).toBe(401)
  })
})
