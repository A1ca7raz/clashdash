import { describe, expect, it } from 'vitest'

import { applyProviderOverride } from './provider-override.ts'

describe('applyProviderOverride', () => {
  it('applies fixed fields, name replacement, prefix and suffix in Mihomo order', () => {
    const input = {
      name: 'IPLC-3倍',
      type: 'hysteria2',
      server: 'example.com',
      port: 443,
      udp: false,
    }

    const output = applyProviderOverride(input, {
      udp: true,
      skipCertVerify: true,
      proxyName: [{ pattern: 'IPLC-(.*?)倍', target: 'IPLC x $1' }],
      additionalPrefix: '[Airport] ',
      additionalSuffix: ' | Premium',
    })

    expect(output).toEqual({
      name: '[Airport] IPLC x 3 | Premium',
      type: 'hysteria2',
      server: 'example.com',
      port: 443,
      udp: true,
      'skip-cert-verify': true,
    })
    expect(input).toEqual({
      name: 'IPLC-3倍',
      type: 'hysteria2',
      server: 'example.com',
      port: 443,
      udp: false,
    })
  })
})
