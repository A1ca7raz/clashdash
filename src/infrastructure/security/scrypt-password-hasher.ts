import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'

import type { PasswordHasher } from '../../application/ports/password-hasher.ts'

const parameters = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const keyLength = 64

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    validatePassword(password)
    const salt = randomBytes(16)
    const derived = await derive(password, salt, keyLength)
    return [
      'scrypt', parameters.N, parameters.r, parameters.p,
      salt.toString('base64url'), derived.toString('base64url'),
    ].join('$')
  }

  async verify(password: string, encodedHash: string): Promise<boolean> {
    const [algorithm, nText, rText, pText, saltText, hashText, extra] = encodedHash.split('$')
    if (algorithm !== 'scrypt' || !nText || !rText || !pText || !saltText || !hashText || extra !== undefined) {
      return false
    }
    const N = Number(nText)
    const r = Number(rText)
    const p = Number(pText)
    if (N !== parameters.N || r !== parameters.r || p !== parameters.p) return false
    try {
      const expected = Buffer.from(hashText, 'base64url')
      const actual = await derive(password, Buffer.from(saltText, 'base64url'), expected.length)
      return actual.length === expected.length && timingSafeEqual(actual, expected)
    } catch {
      return false
    }
  }
}

function derive(password: string, salt: Buffer, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, length, parameters, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

function validatePassword(password: string): void {
  if (Buffer.byteLength(password) > 1024) throw new Error('Password is too long')
}
