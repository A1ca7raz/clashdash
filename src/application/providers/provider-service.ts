import { randomUUID } from 'node:crypto'

import { NotFoundError, ValidationError } from '../errors.ts'
import type { AppStore } from '../ports/app-store.ts'
import type { ProviderScheduler } from '../ports/provider-scheduler.ts'
import type { ProxyProvider } from '../../domain/models/provider.ts'
import { validateProvider } from '../../domain/providers/provider-validator.ts'
import type { ProviderRefreshService } from './provider-refresh-service.ts'

export type CreateProviderInput = Omit<ProxyProvider, 'id'>

export class ProviderService {
  constructor(
    private readonly store: AppStore,
    private readonly refreshService: ProviderRefreshService,
    private readonly createId: () => string = randomUUID,
    private readonly scheduler?: ProviderScheduler,
  ) {}

  async list() { return this.store.listProviders() }

  async get(id: string): Promise<ProxyProvider> {
    const provider = await this.store.getProvider(id)
    if (!provider) throw new NotFoundError(`Provider not found: ${id}`)
    return provider
  }

  async create(input: CreateProviderInput): Promise<ProxyProvider> {
    const provider = { ...structuredClone(input), id: this.createId() } as ProxyProvider
    assertValidProvider(provider)
    await this.store.saveProvider(provider)
    if (provider.type === 'import') this.scheduler?.schedule(provider)
    return provider
  }

  async update(provider: ProxyProvider): Promise<ProxyProvider> {
    if (!await this.store.getProvider(provider.id)) throw new NotFoundError(`Provider not found: ${provider.id}`)
    assertValidProvider(provider)
    await this.store.saveProvider(structuredClone(provider))
    if (provider.type === 'import') this.scheduler?.schedule(provider)
    else this.scheduler?.remove(provider.id)
    return provider
  }

  async delete(id: string): Promise<void> {
    if (!await this.store.deleteProvider(id)) throw new NotFoundError(`Provider not found: ${id}`)
    this.scheduler?.remove(id)
  }

  refresh(id: string) { return this.refreshService.refresh(id) }
  refreshAll(concurrency?: number) { return this.refreshService.refreshAll(concurrency) }
}

function assertValidProvider(provider: ProxyProvider): void {
  const errors = validateProvider(provider).filter((diagnostic) => diagnostic.severity === 'error')
  if (errors.length > 0) throw new ValidationError(errors.map((item) => item.message).join('; '))
}
