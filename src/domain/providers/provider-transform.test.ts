import { describe, expect, it } from 'vitest'

import type { ImportProvider, PassthroughProvider } from '../models/provider.ts'
import {
  parseProviderOverride,
  renderPassthroughProvider,
  renderProviderOverride,
  transformImportedProxies,
} from './provider-transform.ts'

describe('Provider transformation', () => {
  it('filters before applying name overrides', () => {
    const provider: ImportProvider = {
      id: 'provider-1',
      type: 'import',
      name: 'Airport',
      url: 'https://example.test/sub',
      interval: 3600,
      subscriptionFormat: 'clash',
      filter: '^HK',
      override: { additionalPrefix: '[A] ' },
    }

    expect(
      transformImportedProxies(
        [
          { name: 'HK 01', type: 'vmess', server: 'hk.example', port: 443 },
          { name: '[A] JP 01', type: 'vmess', server: 'jp.example', port: 443 },
        ],
        provider,
      ).map((proxy) => proxy.name),
    ).toEqual(['[A] HK 01'])
  })

  it('maps camelCase fields at the Mihomo boundary', () => {
    const provider: PassthroughProvider = {
      id: 'provider-2',
      type: 'passthrough',
      name: 'Remote',
      url: 'https://example.test/sub',
      interval: 3600,
      excludeFilter: 'Expired',
      excludeType: 'ssr|http',
      override: {
        udpOverTcp: true,
        additionalPrefix: '[Remote] ',
      },
      config: {
        'health-check': { enable: true, url: 'https://example.test/204', interval: 300 },
      },
    }

    expect(renderPassthroughProvider(provider)).toEqual({
      type: 'http',
      url: 'https://example.test/sub',
      interval: 3600,
      'exclude-filter': 'Expired',
      'exclude-type': 'ssr|http',
      override: {
        'udp-over-tcp': true,
        'additional-prefix': '[Remote] ',
      },
      'health-check': { enable: true, url: 'https://example.test/204', interval: 300 },
    })
  })

  it('round-trips provider override fields through the Mihomo YAML schema', () => {
    const override = {
      udpOverTcp: true,
      skipCertVerify: false,
      routingMark: 255,
      additionalPrefix: '[Remote] ',
      proxyName: [{ pattern: '^(.*)$', target: '$1 HK' }],
      overrideExpr: ['set udp true'],
    }

    const rendered = renderProviderOverride(override)
    expect(rendered).toEqual({
      'udp-over-tcp': true,
      'skip-cert-verify': false,
      'routing-mark': 255,
      'additional-prefix': '[Remote] ',
      'proxy-name': [{ pattern: '^(.*)$', target: '$1 HK' }],
      'override-expr': ['set udp true'],
    })
    expect(parseProviderOverride(rendered)).toEqual(override)
  })

  it('rejects internal camelCase names in Mihomo override YAML', () => {
    expect(() => parseProviderOverride({ skipCertVerify: true })).toThrow(
      '请使用 Mihomo 字段 "skip-cert-verify"',
    )
    expect(() => parseProviderOverride({ 'proxy-name': [{ pattern: 'HK' }] })).toThrow(
      '必须且只能包含字符串 pattern 和 target',
    )
  })
})
