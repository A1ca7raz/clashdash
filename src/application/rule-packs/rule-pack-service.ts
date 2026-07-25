import { randomUUID } from 'node:crypto'

import { NotFoundError, ValidationError } from '../errors.ts'
import type { AppStore } from '../ports/app-store.ts'
import type { Rule, RulePack } from '../../domain/models/rule.ts'
import { validateRule } from '../../domain/rules/rule-validator.ts'

export class RulePackService {
  constructor(private readonly store: AppStore, private readonly createId: () => string = randomUUID) {}

  async list() { return this.store.listRulePacks() }
  async get(id: string): Promise<RulePack> {
    const value = await this.store.getRulePack(id)
    if (!value) throw new NotFoundError(`RulePack not found: ${id}`)
    return value
  }
  async create(name: string, rules: Rule[]): Promise<RulePack> {
    const value = { id: this.createId(), name: name.trim(), rules: structuredClone(rules) }
    this.validate(value)
    await this.store.saveRulePack(value)
    return value
  }
  async update(value: RulePack): Promise<RulePack> {
    if (!await this.store.getRulePack(value.id)) throw new NotFoundError(`RulePack not found: ${value.id}`)
    this.validate(value)
    await this.store.saveRulePack(structuredClone(value))
    return value
  }
  async delete(id: string): Promise<void> {
    if (!await this.store.deleteRulePack(id)) throw new NotFoundError(`RulePack not found: ${id}`)
  }

  private validate(value: RulePack): void {
    if (!value.name.trim()) throw new ValidationError('RulePack name is required')
    const errors = value.rules.flatMap(validateRule).filter((item) => item.severity === 'error')
    if (errors.length > 0) throw new ValidationError(errors.map((item) => item.message).join('; '))
  }
}
