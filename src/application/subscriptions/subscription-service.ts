import { randomUUID } from 'node:crypto'

import { NotFoundError, ValidationError } from '../errors.ts'
import type { AppStore, ProfileUpdateInfo, StoredSubscriptionToken } from '../ports/app-store.ts'
import type { SubscriptionTokenCipher } from '../ports/subscription-token-cipher.ts'
import type { SubscriptionToken } from '../../domain/models/subscription-token.ts'
import { compileProfile } from '../../domain/compiler/profile-compiler.ts'

export class SubscriptionService {
  constructor(
    private readonly store: AppStore,
    private readonly cipher: SubscriptionTokenCipher,
    private readonly createId: () => string = randomUUID,
  ) {}

  async list(profileId?: string): Promise<SubscriptionToken[]> {
    const records = await this.store.listSubscriptionTokens(profileId)
    return Promise.all(records.map((record) => this.toDomain(record.id)))
  }

  async get(id: string): Promise<SubscriptionToken> { return this.toDomain(id) }

  async issue(profileId: string, note?: string): Promise<SubscriptionToken> {
    const resolved = await this.store.getProfile(profileId)
    if (!resolved) throw new NotFoundError(`Profile not found: ${profileId}`)
    const token = this.cipher.generate()
    const id = this.createId()
    await this.store.saveSubscriptionToken({
      id, profileId,
      ...(note === undefined ? {} : { note }),
      tokenHash: this.cipher.hash(token),
      encryptedToken: this.cipher.encrypt(token),
    })
    return { id, ...(note === undefined ? {} : { note }), profile: resolved.profile, token }
  }

  async revoke(id: string): Promise<void> {
    if (!await this.store.deleteSubscriptionToken(id)) throw new NotFoundError(`Subscription token not found: ${id}`)
  }

  async render(token: string): Promise<{ yaml: string; profileName: string }> {
    const record = await this.findByToken(token)
    const resolved = await this.store.getProfile(record.profileId)
    if (!resolved) throw new NotFoundError(`Profile not found: ${record.profileId}`)
    const result = compileProfile(resolved)
    const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
    if (errors.length > 0) throw new ValidationError(errors.map((item) => item.message).join('; '))
    return { yaml: result.yaml, profileName: resolved.profile.name }
  }

  async updateInfo(token: string): Promise<ProfileUpdateInfo> {
    const record = await this.findByToken(token)
    const info = await this.store.getProfileUpdateInfo(record.profileId)
    if (!info) throw new NotFoundError(`Profile not found: ${record.profileId}`)
    return info
  }

  private async toDomain(id: string): Promise<SubscriptionToken> {
    const record = await this.store.getSubscriptionTokenById(id)
    if (!record) throw new NotFoundError(`Subscription token not found: ${id}`)
    const resolved = await this.store.getProfile(record.profileId)
    if (!resolved) throw new NotFoundError(`Profile not found: ${record.profileId}`)
    return {
      id: record.id,
      ...(record.note === undefined ? {} : { note: record.note }),
      profile: resolved.profile,
      token: this.cipher.decrypt(record.encryptedToken),
    }
  }

  private async findByToken(token: string): Promise<StoredSubscriptionToken> {
    const record = await this.store.getSubscriptionTokenByHash(this.cipher.hash(token))
    if (!record) throw new NotFoundError('Subscription token not found')
    return record
  }
}
