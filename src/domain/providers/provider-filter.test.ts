import { describe, expect, it } from 'vitest'

import type { NamedProxy } from './types.ts'
import { filterProviderProxies } from './provider-filter.ts'

const proxies: NamedProxy[] = [
  { name: '香港 01', type: 'vmess', server: 'hk.example', port: 443 },
  { name: 'HK Expired', type: 'trojan', server: 'expired.example', port: 443 },
  { name: '日本 01', type: 'ss', server: 'jp.example', port: 443 },
  { name: 'Legacy', type: 'ssr', server: 'legacy.example', port: 443 },
]

describe('filterProviderProxies', () => {
  it('uses backticks as OR separators and supports leading (?i)', () => {
    const result = filterProviderProxies(proxies, {
      filter: '(?i)香港|hk`日本|jp',
    })

    expect(result.map((proxy) => proxy.name)).toEqual(['香港 01', 'HK Expired', '日本 01'])
  })

  it('applies exclusions before inclusion', () => {
    const result = filterProviderProxies(proxies, {
      filter: '(?i)香港|hk',
      excludeFilter: '(?i)expired',
      excludeType: 'ssr|http',
    })

    expect(result.map((proxy) => proxy.name)).toEqual(['香港 01'])
  })

  it('reports invalid expressions', () => {
    expect(() => filterProviderProxies(proxies, { filter: '(' })).toThrowError(
      /invalid provider filter/i,
    )
  })
})
