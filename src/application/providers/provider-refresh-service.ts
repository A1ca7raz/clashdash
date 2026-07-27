import { NotFoundError, ValidationError } from '../errors.ts'
import type { AppStore } from '../ports/app-store.ts'
import type { RemoteContentFetcher } from '../ports/remote-content-fetcher.ts'
import type {
  ParsedSubscription,
  SubscriptionParserPort,
} from '../ports/subscription-parser.ts'
import type { ImportProvider } from '../../domain/models/provider.ts'
import { filterProviderProxies } from '../../domain/providers/provider-filter.ts'
import { applyProviderOverride } from '../../domain/providers/provider-override.ts'
import { ProviderLock } from './provider-lock.ts'
import {
  matchProviderNodes,
  type ProviderNodeCandidate,
} from './provider-node-matcher.ts'

export type ProviderRefreshResult = {
  providerId: string
  nodeCount: number
}

export type ProviderRefreshLog = {
  providerId: string
  durationMs: number
} & (
  | { status: 'succeeded'; nodeCount: number }
  | { status: 'failed'; cause: unknown }
)

export type ProviderRefreshServiceOptions = {
  lock?: ProviderLock
  log?: (entry: ProviderRefreshLog) => void
}

export class ProviderRefreshService {
  private readonly lock: ProviderLock
  private readonly log: ((entry: ProviderRefreshLog) => void) | undefined

  constructor(
    private readonly store: AppStore,
    private readonly fetcher: RemoteContentFetcher,
    private readonly parser: SubscriptionParserPort,
    options: ProviderRefreshServiceOptions = {},
  ) {
    this.lock = options.lock ?? new ProviderLock()
    this.log = options.log
  }

  async refresh(providerId: string): Promise<ProviderRefreshResult> {
    const startedAt = performance.now()
    try {
      const result = await this.lock.run(providerId, () => this.performRefresh(providerId))
      this.log?.({
        providerId,
        status: 'succeeded',
        nodeCount: result.nodeCount,
        durationMs: elapsedMilliseconds(startedAt),
      })
      return result
    } catch (cause) {
      this.log?.({ providerId, status: 'failed', cause, durationMs: elapsedMilliseconds(startedAt) })
      throw cause
    }
  }

  private async performRefresh(providerId: string): Promise<ProviderRefreshResult> {
    const provider = await this.store.getProvider(providerId)
    if (provider?.type !== 'import') throw new NotFoundError(`Import provider not found: ${providerId}`)

    const content = await this.fetcher.fetch(provider.url, {
      ...(provider.userAgent === undefined ? {} : { userAgent: provider.userAgent }),
      ...(provider.headers === undefined ? {} : { headers: provider.headers }),
    })
    const parsed = this.parser.parse(content, provider.subscriptionFormat)
    assertValidSubscription(parsed)

    const candidates = createCandidates(provider, parsed)
    const previous = await this.store.listProviderNodeStates(provider.id)
    const states = matchProviderNodes(provider, candidates, previous)
    await this.store.replaceProviderNodes(provider.id, states)
    return { providerId, nodeCount: states.length }
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

function assertValidSubscription(parsed: ParsedSubscription): void {
  const errors = parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
  if (errors.length > 0) {
    throw new ValidationError(errors.map((diagnostic) =>
      `${diagnostic.location ? `${diagnostic.location}: ` : ''}${diagnostic.message}`,
    ).join('; '))
  }
  if (parsed.proxies.length === 0) throw new ValidationError('Provider subscription contains no proxies')
}

function createCandidates(
  provider: ImportProvider,
  parsed: ParsedSubscription,
): ProviderNodeCandidate[] {
  const named = parsed.proxies.map((item) => ({ name: item.name, ...structuredClone(item.proxy) }))
  const filtered = filterProviderProxies(named, provider)
  if (filtered.length === 0) throw new ValidationError('Provider filters excluded every proxy')

  return filtered.map((originalProxy) => {
    const transformedProxy = applyProviderOverride(originalProxy, provider.override)
    const { name: originalName, ...originalFields } = originalProxy
    const { name: transformedName, ...transformedFields } = transformedProxy
    return {
      original: { name: originalName, proxy: originalFields },
      transformed: { name: transformedName, proxy: transformedFields },
    }
  })
}

function elapsedMilliseconds(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt))
}
