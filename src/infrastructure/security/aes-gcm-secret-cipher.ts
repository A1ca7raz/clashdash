import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

import type { SecretCipher } from '../../application/ports/secret-cipher.ts'

const algorithm = 'aes-256-gcm'

export class AesGcmSecretCipher implements SecretCipher {
  private readonly key: Buffer

  constructor(key: Uint8Array | string) {
    this.key = typeof key === 'string' ? Buffer.from(key, 'base64url') : Buffer.from(key)
    if (this.key.byteLength !== 32) throw new Error('Secret key must contain exactly 32 bytes')
  }

  encrypt(plaintext: string): string {
    const nonce = randomBytes(12)
    const cipher = createCipheriv(algorithm, this.key, nonce)
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return `v1.${nonce.toString('base64url')}.${encrypted.toString('base64url')}.${tag.toString('base64url')}`
  }

  decrypt(ciphertext: string): string {
    const [version, nonceText, encryptedText, tagText, extra] = ciphertext.split('.')
    if (version !== 'v1' || !nonceText || encryptedText === undefined || !tagText || extra !== undefined) {
      throw new Error('Invalid encrypted secret')
    }
    try {
      const decipher = createDecipheriv(algorithm, this.key, Buffer.from(nonceText, 'base64url'))
      decipher.setAuthTag(Buffer.from(tagText, 'base64url'))
      return Buffer.concat([
        decipher.update(Buffer.from(encryptedText, 'base64url')),
        decipher.final(),
      ]).toString('utf8')
    } catch {
      throw new Error('Unable to decrypt secret')
    }
  }
}
