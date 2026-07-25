import { describe, expect, it } from 'vitest'

import { AesSubscriptionTokenCipher } from './aes-subscription-token-cipher.ts'
import { AesGcmSecretCipher } from './aes-gcm-secret-cipher.ts'
import { JoseAdminTokenService } from './jose-admin-token-service.ts'
import { Rfc6238TotpService } from './rfc6238-totp-service.ts'
import { ScryptPasswordHasher } from './scrypt-password-hasher.ts'

describe('security adapters', () => {
  it('hashes passwords with a random salt and verifies them', async () => {
    const hasher = new ScryptPasswordHasher()
    const first = await hasher.hash('correct horse battery staple')
    const second = await hasher.hash('correct horse battery staple')
    expect(first).not.toBe(second)
    await expect(hasher.verify('correct horse battery staple', first)).resolves.toBe(true)
    await expect(hasher.verify('wrong password', first)).resolves.toBe(false)
    await expect(hasher.verify('anything', 'bad-hash')).resolves.toBe(false)
  })

  it('does not impose password length or complexity rules', async () => {
    const hasher = new ScryptPasswordHasher()
    const encoded = await hasher.hash('1')
    await expect(hasher.verify('1', encoded)).resolves.toBe(true)
  })

  it('issues and verifies constrained admin JWTs', async () => {
    const service = new JoseAdminTokenService('a'.repeat(32), { issuer: 'test', audience: 'admin' })
    const token = await service.issue('admin')
    await expect(service.verify(token)).resolves.toEqual({ username: 'admin' })
    await expect(new JoseAdminTokenService('b'.repeat(32), { issuer: 'test', audience: 'admin' }).verify(token)).rejects.toThrow()
    await expect(new JoseAdminTokenService('a'.repeat(32), { issuer: 'other', audience: 'admin' }).verify(token)).rejects.toThrow()
  })

  it('generates and verifies RFC 6238 compatible TOTP codes', () => {
    const service = new Rfc6238TotpService(() => 59_000)
    const rfcSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
    expect(service.generateCode(rfcSecret)).toBe('287082')
    expect(service.verify(rfcSecret, '287082')).toBe(true)
    expect(service.verify(rfcSecret, '287082', 89_000)).toBe(true)
    expect(service.verify(rfcSecret, '000000')).toBe(false)
    expect(service.verify('not base32!', '287082')).toBe(false)
    expect(service.provisioningUri(rfcSecret, 'admin@example.com')).toContain('otpauth://totp/ClashDash:admin%40example.com')
  })

  it('encrypts plaintext tokens for repeated reads and hashes them deterministically', () => {
    const service = new AesSubscriptionTokenCipher(Buffer.alloc(32, 7))
    const token = service.generate()
    expect(token).toMatch(/^[a-z0-9_-]{32}$/)
    expect(new Set(Array.from({ length: 100 }, () => service.generate())).size).toBe(100)
    const first = service.encrypt(token)
    const second = service.encrypt(token)
    expect(first).not.toBe(second)
    expect(service.decrypt(first)).toBe(token)
    expect(service.hash(token)).toBe(service.hash(token))
    const parts = first.split('.')
    const encrypted = parts[2] ?? ''
    parts[2] = `${encrypted.startsWith('A') ? 'B' : 'A'}${encrypted.slice(1)}`
    const tampered = parts.join('.')
    expect(() => service.decrypt(tampered)).toThrow('Unable to decrypt')
  })

  it('encrypts TOTP secrets through the generic secret cipher port', () => {
    const cipher = new AesGcmSecretCipher(Buffer.alloc(32, 5))
    const encrypted = cipher.encrypt('JBSWY3DPEHPK3PXP')
    expect(encrypted).not.toContain('JBSWY3DPEHPK3PXP')
    expect(cipher.decrypt(encrypted)).toBe('JBSWY3DPEHPK3PXP')
    expect(() => new AesGcmSecretCipher(Buffer.alloc(31))).toThrow('exactly 32 bytes')
  })
})
