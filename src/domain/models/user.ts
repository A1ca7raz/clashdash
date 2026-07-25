export type User = {
  username: string
  passwordHash: string
  totpEnabled: boolean
  totpSecretEncrypted?: string
}
