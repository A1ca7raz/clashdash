import { NotFoundError, ValidationError } from '../errors.ts'
import type { AppStore } from '../ports/app-store.ts'
import type { RemoteContentFetcher } from '../ports/remote-content-fetcher.ts'
import type { SubscriptionParserPort } from '../ports/subscription-parser.ts'
import { filterProviderProxies } from '../../domain/providers/provider-filter.ts'
import { applyProviderOverride } from '../../domain/providers/provider-override.ts'
import { ProviderLock } from './provider-lock.ts'
import { matchProviderNodes } from './provider-node-matcher.ts'

export type ProviderRefreshResult = {
  providerId: string
  nodeCount: number
}

export class ProviderRefreshService {
  constructor(
    private readonly store: AppStore,
    private readonly fetcher: RemoteContentFetcher,
    private readonly parser: SubscriptionParserPort,
    private readonly lock = new ProviderLock(),
  ) {}

  async refresh(providerId: string): Promise<ProviderRefreshResult> {
    return this.lock.run(providerId, async () => {
      const provider = await this.store.getProvider(providerId)
      if (provider?.type !== 'import') throw new NotFoundError(`Import provider not found: ${providerId}`)

      const content = await this.fetcher.fetch(provider.url)
      const parsed = this.parser.parse(content, provider.subscriptionFormat)
      const errors = parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
      if (errors.length > 0) {
        throw new ValidationError(errors.map((diagnostic) =>
          `${diagnostic.location ? `${diagnostic.location}: ` : ''}${diagnostic.message}`,
        ).join('; '))
      }
      if (parsed.proxies.length === 0) throw new ValidationError('Provider subscription contains no proxies')

      const named = parsed.proxies.map((item) => ({ name: item.name, ...structuredClone(item.proxy) }))
      const filtered = filterProviderProxies(named, provider)
      if (filtered.length === 0) throw new ValidationError('Provider filters excluded every proxy')
      const candidates = filtered.map((originalProxy) => {
        const proxy = applyProviderOverride(originalProxy, provider.override)
        const { name, ...fields } = proxy
        const { name: originalName, ...originalFields } = originalProxy
        return {
          original: { name: originalName, proxy: originalFields },
          transformed: { name, proxy: fields },
        }
      })
      const states = matchProviderNodes(provider, candidates, await this.store.listProviderNodeStates(provider.id))
      await this.store.replaceProviderNodes(provider.id, states)
      return { providerId, nodeCount: states.length }
    })
  }

  async refreshAll(concurrency = 4): Promise<Array<PromiseSettledResult<ProviderRefreshResult>>> {
    const ids = (await this.store.listProviders()).filter((provider) => provider.type === 'import').map((provider) => provider.id)
    const results: Array<PromiseSettledResult<ProviderRefreshResult>> = new Array(ids.length)
    let next = 0
    const workers = Array.from({ length: Math.min(Math.max(1, concurrency), ids.length) }, async () => {
      while (next < ids.length) {
        const index = next
        next += 1
        const id = ids[index]
        if (!id) continue
        try { results[index] = { status: 'fulfilled', value: await this.refresh(id) } }
        catch (reason) { results[index] = { status: 'rejected', reason } }
      }
    })
    await Promise.all(workers)
    return results
  }
}
