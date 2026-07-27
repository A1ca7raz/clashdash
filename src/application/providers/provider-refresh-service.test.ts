import { afterEach, describe, expect, it } from 'vitest'

import { ValidationError } from '../errors.ts'
import type {
  RemoteContentFetcher,
  RemoteContentFetchOptions,
} from '../ports/remote-content-fetcher.ts'
import type { ImportProvider } from '../../domain/models/provider.ts'
import { SubscriptionParserRegistry } from '../../shared/subscription-parser/index.ts'
import { SqliteStore } from '../../infrastructure/store/sqlite/sqlite-store.ts'
import { ProviderRefreshService } from './provider-refresh-service.ts'
import type { ProviderRefreshLog } from './provider-refresh-service.ts'

class MutableFetcher implements RemoteContentFetcher {
  content = ''
  error: Error | undefined
  lastUrl: string | undefined
  lastOptions: RemoteContentFetchOptions | undefined
  async fetch(url: string, options?: RemoteContentFetchOptions): Promise<string> {
    this.lastUrl = url
    this.lastOptions = options
    if (this.error) throw this.error
    return this.content
  }
}

describe('ProviderRefreshService', () => {
  const stores: SqliteStore[] = []
  afterEach(() => { stores.splice(0).forEach((store) => store.close()) })

  function setup(log?: (entry: ProviderRefreshLog) => void): {
    store: SqliteStore
    fetcher: MutableFetcher
    service: ProviderRefreshService
    provider: ImportProvider
  } {
    const store = new SqliteStore()
    stores.push(store)
    const fetcher = new MutableFetcher()
    const provider: ImportProvider = {
      type: 'import', id: 'provider-1', name: 'Airport', url: 'https://example.com/sub', interval: 3600,
      subscriptionFormat: 'clash', filter: 'HK', override: { additionalPrefix: '[A] ', udp: true },
    }
    store.saveProvider(provider)
    return {
      store,
      fetcher,
      service: new ProviderRefreshService(store, fetcher, new SubscriptionParserRegistry(), { ...(log ? { log } : {}) }),
      provider,
    }
  }

  it('filters, overrides, and preserves a node id when its parameters change', async () => {
    const { store, fetcher, service, provider } = setup()
    fetcher.content = clashSubscription('server-a.example')
    await expect(service.refresh(provider.id)).resolves.toEqual({ providerId: provider.id, nodeCount: 1 })
    const first = store.listProviderNodeStates(provider.id)[0]
    expect(first?.node).toMatchObject({ name: '[A] HK 1', proxy: { server: 'server-a.example', udp: true } })

    fetcher.content = clashSubscription('server-b.example')
    await service.refresh(provider.id)
    const second = store.listProviderNodeStates(provider.id)[0]
    expect(second?.node.id).toBe(first?.node.id)
    expect(second?.node.proxy.server).toBe('server-b.example')
  })

  it('keeps old nodes when fetch or parsing fails', async () => {
    const { store, fetcher, service, provider } = setup()
    fetcher.content = clashSubscription('server-a.example')
    await service.refresh(provider.id)
    const old = store.listProviderNodeStates(provider.id)

    fetcher.error = new Error('network down')
    await expect(service.refresh(provider.id)).rejects.toThrow('network down')
    expect(store.listProviderNodeStates(provider.id)).toEqual(old)

    fetcher.error = undefined
    fetcher.content = 'proxies:\n  - name: broken'
    await expect(service.refresh(provider.id)).rejects.toBeInstanceOf(ValidationError)
    expect(store.listProviderNodeStates(provider.id)).toEqual(old)
  })

  it('passes custom request settings to the remote fetcher', async () => {
    const { store, fetcher, service, provider } = setup()
    const configured = {
      ...provider,
      userAgent: 'CustomClient/2.0',
      headers: { Authorization: ['Bearer secret'], 'X-Client': ['ClashDash'] },
    }
    store.saveProvider(configured)
    fetcher.content = clashSubscription('server-a.example')

    await service.refresh(provider.id)

    expect(fetcher.lastUrl).toBe(provider.url)
    expect(fetcher.lastOptions).toEqual({
      userAgent: 'CustomClient/2.0',
      headers: { Authorization: ['Bearer secret'], 'X-Client': ['ClashDash'] },
    })
  })

  it('logs successful and failed refreshes without request secrets', async () => {
    const logs: ProviderRefreshLog[] = []
    const { fetcher, service, provider } = setup((entry) => logs.push(entry))
    fetcher.content = clashSubscription('server-a.example')

    await service.refresh(provider.id)
    fetcher.error = new Error('network down')
    await expect(service.refresh(provider.id)).rejects.toThrow('network down')

    expect(logs[0]).toMatchObject({
      providerId: provider.id, status: 'succeeded', nodeCount: 1,
    })
    expect(logs[0]?.durationMs).toBeGreaterThanOrEqual(0)
    expect(logs[1]).toMatchObject({
      providerId: provider.id, status: 'failed', cause: fetcher.error,
    })
    expect(logs[1]?.durationMs).toBeGreaterThanOrEqual(0)
    expect(JSON.stringify(logs)).not.toContain(provider.url)
  })
})

function clashSubscription(server: string): string {
  return `
proxies:
  - name: HK 1
    type: ss
    server: ${server}
    port: 443
    cipher: aes-128-gcm
    password: secret
  - name: US 1
    type: ss
    server: us.example
    port: 443
    cipher: aes-128-gcm
    password: secret
`
}
