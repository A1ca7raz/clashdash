import { randomUUID } from 'node:crypto'

import { NotFoundError, ValidationError } from '../errors.ts'
import type { AppStore } from '../ports/app-store.ts'
import type { JsonObject } from '../../domain/json.ts'
import type { RuleProvider } from '../../domain/models/rule-provider.ts'
import { validateRuleProviderConfig } from '../../domain/rule-providers/rule-provider-validator.ts'

export class RuleProviderService {
  constructor(private readonly store: AppStore, private readonly createId: () => string = randomUUID) {}

  async list(): Promise<RuleProvider[]> { return this.store.listRuleProviders() }

  async get(id: string): Promise<RuleProvider> {
    const value = await this.store.getRuleProvider(id)
    if (!value) throw new NotFoundError(`Rule Provider not found: ${id}`)
    return value
  }

  async create(name: string, config: JsonObject): Promise<RuleProvider> {
    const value = { id: this.createId(), name: name.trim(), config: structuredClone(config) }
    this.validate(value)
    await this.store.saveRuleProvider(value)
    return value
  }

  async update(value: RuleProvider): Promise<RuleProvider> {
    const existing = await this.store.getRuleProvider(value.id)
    if (!existing) throw new NotFoundError(`Rule Provider not found: ${value.id}`)
    const normalized = { ...structuredClone(value), name: value.name.trim() }
    this.validate(normalized)
    await this.store.saveRuleProvider(normalized, existing.name)
    return normalized
  }

  async delete(id: string): Promise<void> {
    if (!await this.store.deleteRuleProvider(id)) throw new NotFoundError(`Rule Provider not found: ${id}`)
  }

  private validate(value: RuleProvider): void {
    if (!value.name) throw new ValidationError('Rule Provider name is required')
    const errors = validateRuleProviderConfig(value.config).filter((item) => item.severity === 'error')
    if (errors.length > 0) throw new ValidationError(errors.map((item) => item.message).join('; '))
  }
}
