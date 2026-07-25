import {
  createHash,
  randomBytes,
} from 'node:crypto'

import type { SubscriptionTokenCipher } from '../../application/ports/subscription-token-cipher.ts'
import { AesGcmSecretCipher } from './aes-gcm-secret-cipher.ts'

const tokenAlphabet = 'abcdefghijklmnopqrstuvwxyz0123456789-_'
const tokenLength = 32
const unbiasedByteLimit = 256 - (256 % tokenAlphabet.length)

export class AesSubscriptionTokenCipher extends AesGcmSecretCipher implements SubscriptionTokenCipher {
  generate(): string {
    let token = ''
    while (token.length < tokenLength) {
      for (const byte of randomBytes(tokenLength - token.length)) {
        if (byte >= unbiasedByteLimit) continue
        token += tokenAlphabet[byte % tokenAlphabet.length]
        if (token.length === tokenLength) break
      }
    }
    return token
  }

  hash(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('base64url')
  }

}
