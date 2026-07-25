export interface TotpService {
  generateSecret(): string
  generateCode(secret: string, timestampMs?: number): string
  verify(secret: string, code: string, timestampMs?: number): boolean
  provisioningUri(secret: string, account: string, issuer?: string): string
}
