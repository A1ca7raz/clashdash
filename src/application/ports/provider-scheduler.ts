import type { ImportProvider } from '../../domain/models/provider.ts'

export interface ProviderScheduler {
  schedule(provider: ImportProvider): void
  remove(providerId: string): void
  shutdown(): void
}
