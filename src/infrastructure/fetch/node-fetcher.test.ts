import { afterEach, describe, expect, it, vi } from 'vitest'

import { NodeFetcher } from './node-fetcher.ts'

describe('NodeFetcher', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('uses clash.meta as the default User-Agent', async () => {
    let requestHeaders: Headers | undefined
    vi.stubGlobal('fetch', vi.fn(async (_url: URL, init: RequestInit) => {
      requestHeaders = new Headers(init.headers)
      return new Response('proxies: []')
    }))

    await new NodeFetcher().fetch('https://example.com/subscription')

    expect(requestHeaders?.get('user-agent')).toBe('clash.meta')
    expect(requestHeaders?.get('accept')).toBe('text/yaml,text/plain,*/*')
  })

  it('applies a Provider User-Agent and custom multi-value headers', async () => {
    let requestHeaders: Headers | undefined
    vi.stubGlobal('fetch', vi.fn(async (_url: URL, init: RequestInit) => {
      requestHeaders = new Headers(init.headers)
      return new Response('proxies: []')
    }))

    await new NodeFetcher().fetch('https://example.com/subscription', {
      userAgent: 'CustomClient/2.0',
      headers: {
        Authorization: ['Bearer secret'],
        'X-Feature': ['one', 'two'],
      },
    })

    expect(requestHeaders?.get('user-agent')).toBe('CustomClient/2.0')
    expect(requestHeaders?.get('authorization')).toBe('Bearer secret')
    expect(requestHeaders?.get('x-feature')).toBe('one, two')
  })
})
