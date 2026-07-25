import type { ProviderScheduler } from '../../application/ports/provider-scheduler.ts'

export class NoopScheduler implements ProviderScheduler {
  schedule(): void {}
  remove(): void {}
  shutdown(): void {}
}
