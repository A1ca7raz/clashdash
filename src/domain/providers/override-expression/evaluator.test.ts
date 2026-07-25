import { describe, expect, it } from 'vitest'

import { applyOverrideExpressions } from './evaluator.ts'

describe('override expression evaluator', () => {
  it('applies Mihomo update examples in order', () => {
    const result = applyOverrideExpressions({
      name: '  HK-01  ', type: 'ss', password: 'secret', alpn: ['h2', 'http/1.1'], tags: 'hk,fast',
    }, [
      '.name |= trim | .name |= sub("^HK-(.*)$", "Hong Kong $1")',
      '.name = "[provider] " + .name',
      '.udp = true',
      '.plugin-opts.mode = "tls"',
      '.alpn[] |= upcase',
      '.tags |= split(",")',
      'del(.password)',
    ])

    expect(result).toEqual({
      name: '[provider] Hong Kong 01', type: 'ss', udp: true,
      'plugin-opts': { mode: 'tls' }, alpn: ['H2', 'HTTP/1.1'], tags: ['hk', 'fast'],
    })
  })

  it('supports compound assignment and deep mapping merge', () => {
    expect(applyOverrideExpressions({ retries: 2, options: { tls: { enabled: false } } }, [
      '.retries += 1',
      '.options *= {"tls": {"enabled": true}, "udp": true}',
    ])).toEqual({ retries: 3, options: { tls: { enabled: true }, udp: true } })
  })

  it('reports the source and array index on an invalid expression', () => {
    expect(() => applyOverrideExpressions({ name: 'A' }, ['.name = unknown()']))
      .toThrow('overrideExpr[0] ".name = unknown()"')
  })
})
