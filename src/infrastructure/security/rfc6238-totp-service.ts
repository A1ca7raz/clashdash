import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import type { TotpService } from '../../application/ports/totp-service.ts'

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const periodSeconds = 30
const digits = 6

export class Rfc6238TotpService implements TotpService {
  constructor(private readonly clock: () => number = Date.now) {}

  generateSecret(): string {
    return encodeBase32(randomBytes(20))
  }

  generateCode(secret: string, timestampMs = this.clock()): string {
    const counter = Math.floor(timestampMs / 1000 / periodSeconds)
    return codeForCounter(decodeBase32(secret), counter)
  }

  verify(secret: string, code: string, timestampMs = this.clock()): boolean {
    const normalized = code.replace(/\s/g, '')
    if (!/^\d{6}$/.test(normalized)) return false
    let key: Buffer
    try { key = decodeBase32(secret) } catch { return false }
    const counter = Math.floor(timestampMs / 1000 / periodSeconds)
    const supplied = Buffer.from(normalized)
    for (const offset of [-1, 0, 1]) {
      const expected = Buffer.from(codeForCounter(key, counter + offset))
      if (timingSafeEqual(supplied, expected)) return true
    }
    return false
  }

  provisioningUri(secret: string, account: string, issuer = 'ClashDash'): string {
    const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`
    const query = new URLSearchParams({
      secret,
      issuer,
      algorithm: 'SHA1',
      digits: String(digits),
      period: String(periodSeconds),
    })
    return `otpauth://totp/${label}?${query.toString()}`
  }
}

function codeForCounter(key: Buffer, counter: number): string {
  if (!Number.isSafeInteger(counter) || counter < 0) throw new Error('Invalid TOTP counter')
  const value = Buffer.alloc(8)
  value.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', key).update(value).digest()
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f
  const binary = ((digest[offset] ?? 0) & 0x7f) << 24
    | ((digest[offset + 1] ?? 0) & 0xff) << 16
    | ((digest[offset + 2] ?? 0) & 0xff) << 8
    | ((digest[offset + 3] ?? 0) & 0xff)
  return String(binary % 10 ** digits).padStart(digits, '0')
}

function encodeBase32(value: Uint8Array): string {
  let output = ''
  let bits = 0
  let buffer = 0
  for (const byte of value) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      output += alphabet[(buffer >>> bits) & 31]
    }
  }
  if (bits > 0) output += alphabet[(buffer << (5 - bits)) & 31]
  return output
}

function decodeBase32(value: string): Buffer {
  const normalized = value.toUpperCase().replace(/=+$/g, '').replace(/\s/g, '')
  if (!normalized || !/^[A-Z2-7]+$/.test(normalized)) throw new Error('Invalid Base32 secret')
  const output: number[] = []
  let bits = 0
  let buffer = 0
  for (const character of normalized) {
    buffer = (buffer << 5) | alphabet.indexOf(character)
    bits += 5
    if (bits >= 8) {
      bits -= 8
      output.push((buffer >>> bits) & 0xff)
    }
  }
  return Buffer.from(output)
}
