import { afterEach, describe, expect, it } from 'vitest'

import { AuthService } from './auth/auth-service.ts'
import { ProfileService } from './profiles/profile-service.ts'
import { SubscriptionService } from './subscriptions/subscription-service.ts'
import { AesSubscriptionTokenCipher } from '../infrastructure/security/aes-subscription-token-cipher.ts'
import { JoseAdminTokenService } from '../infrastructure/security/jose-admin-token-service.ts'
import { Rfc6238TotpService } from '../infrastructure/security/rfc6238-totp-service.ts'
import { ScryptPasswordHasher } from '../infrastructure/security/scrypt-password-hasher.ts'
import { SqliteStore } from '../infrastructure/store/sqlite/sqlite-store.ts'

describe('application services', () => {
  const stores: SqliteStore[] = []
  afterEach(() => stores.splice(0).forEach((store) => store.close()))

  it('initializes, logs in, and authenticates the sole administrator', async () => {
    const store = new SqliteStore(); stores.push(store)
    const passwordHasher = new ScryptPasswordHasher()
    store.initializeUser({
      username: 'admin', passwordHash: await passwordHasher.hash('correct horse battery staple'), totpEnabled: false,
    })
    const service = new AuthService(store, passwordHasher, new JoseAdminTokenService('s'.repeat(32)))
    const token = await service.login('admin', 'correct horse battery staple')
    await expect(service.authenticate(token)).resolves.toEqual({ username: 'admin' })
    await expect(service.login('admin', 'incorrect value')).rejects.toThrow('Invalid username or password')
  })

  it('persists TOTP setup and protects login and password changes', async () => {
    const store = new SqliteStore(); stores.push(store)
    const passwordHasher = new ScryptPasswordHasher()
    await store.initializeUser({
      username: 'admin', passwordHash: await passwordHasher.hash('old-password'), totpEnabled: false,
    })
    const totp = new Rfc6238TotpService(() => 59_000)
    const service = new AuthService(
      store,
      passwordHasher,
      new JoseAdminTokenService('t'.repeat(32)),
      totp,
      new AesSubscriptionTokenCipher(Buffer.alloc(32, 6)),
    )

    await expect(service.securityStatus()).resolves.toEqual({
      username: 'admin', totpEnabled: false, totpSetupPending: false,
    })
    const setup = await service.beginTotpSetup('old-password')
    expect(setup.provisioningUri).toContain('otpauth://totp/ClashDash:admin')
    expect(store.getUser()?.totpSecretEncrypted).not.toContain(setup.secret)
    await expect(service.securityStatus()).resolves.toMatchObject({ totpSetupPending: true })

    const code = totp.generateCode(setup.secret)
    await service.confirmTotpSetup(code)
    await expect(service.login('admin', 'old-password')).rejects.toThrow('TOTP code is required')
    await expect(service.login('admin', 'old-password', '000000')).rejects.toThrow('Invalid TOTP code')
    await expect(service.login('admin', 'old-password', code)).resolves.toEqual(expect.any(String))
    await expect(service.changePassword('old-password', 'new', undefined)).rejects.toThrow('TOTP code is required')
    await service.changePassword('old-password', 'new', code)
    await expect(service.login('admin', 'old-password', code)).rejects.toThrow('Invalid username or password')
    await expect(service.login('admin', 'new', code)).resolves.toEqual(expect.any(String))

    await service.disableTotp('new', code)
    expect(store.getUser()).toMatchObject({ totpEnabled: false })
    expect(store.getUser()?.totpSecretEncrypted).toBeUndefined()
    await expect(service.login('admin', 'new')).resolves.toEqual(expect.any(String))
  })

  it('returns the same plaintext subscription token on later reads and renders YAML', async () => {
    const store = new SqliteStore(); stores.push(store)
    const profiles = new ProfileService(store, () => 'profile-1')
    await profiles.create({
      name: 'Default', tags: [], generalConfig: { mode: 'rule' }, selectedNodes: [], listeners: [],
      proxyGroups: [], ruleEntries: [{ type: 'rule', rule: { type: 'MATCH', parameters: [], policy: 'DIRECT' } }],
      ruleProviders: [],
      passthroughProviders: [],
    })
    const subscriptions = new SubscriptionService(
      store, new AesSubscriptionTokenCipher(Buffer.alloc(32, 9)), () => 'token-1',
    )
    const issued = await subscriptions.issue('profile-1', 'phone')
    expect((await subscriptions.get(issued.id)).token).toBe(issued.token)
    expect((await subscriptions.list('profile-1'))[0]?.token).toBe(issued.token)
    expect((await subscriptions.render(issued.token)).yaml).toContain('MATCH,DIRECT')
    const initialInfo = await subscriptions.updateInfo(issued.token)
    expect(initialInfo).toMatchObject({ version: 1, updateTime: expect.any(Number) })
    await profiles.save({ ...issued.profile, note: 'updated' })
    await expect(subscriptions.updateInfo(issued.token)).resolves.toMatchObject({
      version: 2,
      updateTime: expect.any(Number),
    })
    await expect(subscriptions.updateInfo('invalid')).rejects.toThrow('Subscription token not found')
  })
})
