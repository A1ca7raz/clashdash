import { AdminTokenError, AuthenticationError, ConflictError, NotFoundError, TotpRequiredError, ValidationError } from '../errors.ts'
import type { AdminTokenService } from '../ports/admin-token-service.ts'
import type { AppStore } from '../ports/app-store.ts'
import type { PasswordHasher } from '../ports/password-hasher.ts'
import type { SecretCipher } from '../ports/secret-cipher.ts'
import type { TotpService } from '../ports/totp-service.ts'
import type { User } from '../../domain/models/user.ts'

export type AccountSecurityStatus = {
  username: string
  totpEnabled: boolean
  totpSetupPending: boolean
}

export type TotpSetup = {
  secret: string
  provisioningUri: string
}

export class AuthService {
  constructor(
    private readonly store: AppStore,
    private readonly passwordHasher: PasswordHasher,
    private readonly adminTokens: AdminTokenService,
    private readonly totp?: TotpService,
    private readonly secretCipher?: SecretCipher,
  ) {}

  async login(username: string, password: string, totpCode?: string): Promise<string> {
    const user = await this.store.getUser()
    if (!user) throw new NotFoundError('Administrator is not initialized')
    const valid = user.username === username && await this.passwordHasher.verify(password, user.passwordHash)
    if (!valid) throw new AuthenticationError('Invalid username or password')
    if (user.totpEnabled) {
      if (!totpCode) throw new TotpRequiredError('TOTP code is required')
      if (!this.verifyTotp(user, totpCode)) throw new AuthenticationError('Invalid TOTP code')
    }
    return this.adminTokens.issue(user.username)
  }

  async authenticate(token: string): Promise<{ username: string }> {
    try {
      const claims = await this.adminTokens.verify(token)
      const user = await this.store.getUser()
      if (!user || claims.username !== user.username) throw new Error()
      return claims
    } catch {
      throw new AdminTokenError('Invalid or expired admin token')
    }
  }

  async securityStatus(): Promise<AccountSecurityStatus> {
    const user = await this.requireUser()
    return {
      username: user.username,
      totpEnabled: user.totpEnabled,
      totpSetupPending: !user.totpEnabled && user.totpSecretEncrypted !== undefined,
    }
  }

  async changePassword(currentPassword: string, newPassword: string, totpCode?: string): Promise<void> {
    const user = await this.requireUser()
    await this.verifySensitiveAction(user, currentPassword, totpCode)
    const passwordHash = await this.passwordHasher.hash(newPassword)
    await this.store.saveUser({ ...user, passwordHash })
  }

  async beginTotpSetup(currentPassword: string): Promise<TotpSetup> {
    const user = await this.requireUser()
    if (!await this.passwordHasher.verify(currentPassword, user.passwordHash)) {
      throw new AuthenticationError('Invalid current password')
    }
    if (user.totpEnabled) throw new ConflictError('Disable TOTP before configuring a new secret')
    const { totp, cipher } = this.requireTotpDependencies()
    const secret = totp.generateSecret()
    await this.store.saveUser({
      ...user,
      totpEnabled: false,
      totpSecretEncrypted: cipher.encrypt(secret),
    })
    return { secret, provisioningUri: totp.provisioningUri(secret, user.username) }
  }

  async confirmTotpSetup(code: string): Promise<void> {
    const user = await this.requireUser()
    if (user.totpEnabled) throw new ConflictError('TOTP is already enabled')
    if (!user.totpSecretEncrypted) throw new ValidationError('Start TOTP setup before confirming it')
    if (!this.verifyTotp(user, code)) throw new ValidationError('Invalid TOTP code')
    await this.store.saveUser({ ...user, totpEnabled: true })
  }

  async disableTotp(currentPassword: string, code: string): Promise<void> {
    const user = await this.requireUser()
    if (!user.totpEnabled) throw new ConflictError('TOTP is not enabled')
    await this.verifySensitiveAction(user, currentPassword, code)
    const { totpSecretEncrypted: _secret, ...withoutSecret } = user
    await this.store.saveUser({ ...withoutSecret, totpEnabled: false })
  }

  private async requireUser(): Promise<User> {
    const user = await this.store.getUser()
    if (!user) throw new NotFoundError('Administrator is not initialized')
    return user
  }

  private async verifySensitiveAction(user: User, password: string, totpCode?: string): Promise<void> {
    if (!await this.passwordHasher.verify(password, user.passwordHash)) {
      throw new AuthenticationError('Invalid current password')
    }
    if (user.totpEnabled) {
      if (!totpCode) throw new TotpRequiredError('TOTP code is required')
      if (!this.verifyTotp(user, totpCode)) throw new AuthenticationError('Invalid TOTP code')
    }
  }

  private verifyTotp(user: User, code: string): boolean {
    if (!user.totpSecretEncrypted) throw new AuthenticationError('TOTP configuration is invalid')
    const { totp, cipher } = this.requireTotpDependencies()
    try { return totp.verify(cipher.decrypt(user.totpSecretEncrypted), code) }
    catch { throw new AuthenticationError('TOTP configuration is invalid') }
  }

  private requireTotpDependencies(): { totp: TotpService; cipher: SecretCipher } {
    if (!this.totp || !this.secretCipher) throw new Error('TOTP services are not configured')
    return { totp: this.totp, cipher: this.secretCipher }
  }
}
