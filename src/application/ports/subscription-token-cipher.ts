import type { SecretCipher } from './secret-cipher.ts'

export interface SubscriptionTokenCipher extends SecretCipher {
  generate(): string
  hash(token: string): string
}
