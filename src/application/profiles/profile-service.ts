import { randomUUID } from 'node:crypto'

import { NotFoundError, ValidationError } from '../errors.ts'
import type { AppStore } from '../ports/app-store.ts'
import type { Profile, ResolvedProfile } from '../../domain/models/profile.ts'
import { compileProfile, type ProfileCompileResult } from '../../domain/compiler/profile-compiler.ts'

export type CreateProfileInput = Omit<Profile, 'id'>

export class ProfileService {
  constructor(private readonly store: AppStore, private readonly createId: () => string = randomUUID) {}

  async list() { return this.store.listProfiles() }
  async get(id: string): Promise<ResolvedProfile> {
    const value = await this.store.getProfile(id)
    if (!value) throw new NotFoundError(`Profile not found: ${id}`)
    return value
  }
  async create(input: CreateProfileInput): Promise<ResolvedProfile> {
    const profile = { ...structuredClone(input), id: this.createId() }
    validateProfileBasics(profile)
    await this.store.saveProfile(profile)
    return { profile, missingReferences: [] }
  }
  async save(profile: Profile): Promise<ResolvedProfile> {
    if (!await this.store.getProfile(profile.id)) throw new NotFoundError(`Profile not found: ${profile.id}`)
    validateProfileBasics(profile)
    await this.store.saveProfile(structuredClone(profile))
    return { profile, missingReferences: [] }
  }
  async preview(id: string): Promise<ProfileCompileResult> { return compileProfile(await this.get(id)) }
  previewDraft(profile: Profile): ProfileCompileResult {
    validateProfileBasics(profile)
    return compileProfile({ profile, missingReferences: [] })
  }
  async delete(id: string): Promise<void> {
    if (!await this.store.deleteProfile(id)) throw new NotFoundError(`Profile not found: ${id}`)
  }
}

function validateProfileBasics(profile: Profile): void {
  if (!profile.name.trim()) throw new ValidationError('Profile name is required')
}
