import { describe, expect, it } from 'vitest'

import type { RuleEntry } from '../models/rule.ts'
import { expandRuleEntries } from './rule-entry-expander.ts'
import { serializeRule } from './rule-serializer.ts'
import { validateRule } from './rule-validator.ts'

describe('Rule', () => {
  it('serializes parameters, policy and modifiers in order', () => {
    expect(
      serializeRule({
        type: 'IP-CIDR',
        parameters: ['192.168.0.0/16'],
        policy: 'DIRECT',
        modifiers: ['no-resolve'],
      }),
    ).toBe('IP-CIDR,192.168.0.0/16,DIRECT,no-resolve')
  })

  it('validates MATCH and reports unknown types as warnings', () => {
    expect(
      validateRule({ type: 'MATCH', parameters: ['unexpected'], policy: 'Proxy' }),
    ).toContainEqual(expect.objectContaining({ code: 'RULE_PARAMETER_COUNT', severity: 'error' }))

    expect(
      validateRule({ type: 'FUTURE-RULE', parameters: ['value'], policy: 'Proxy' }),
    ).toContainEqual(expect.objectContaining({ code: 'UNKNOWN_RULE_TYPE', severity: 'warning' }))
  })

  it('expands full RulePack objects at their position', () => {
    const entries: RuleEntry[] = [
      {
        type: 'rule',
        rule: { type: 'DOMAIN', parameters: ['example.com'], policy: 'Proxy' },
      },
      {
        type: 'rulePack',
        rulePack: {
          id: 'china',
          name: 'China',
          rules: [
            { type: 'GEOSITE', parameters: ['cn'], policy: 'DIRECT' },
            { type: 'GEOIP', parameters: ['cn'], policy: 'DIRECT' },
          ],
        },
      },
      {
        type: 'rule',
        rule: { type: 'MATCH', parameters: [], policy: 'Proxy' },
      },
    ]

    const result = expandRuleEntries(entries)
    expect(result.rules.map(serializeRule)).toEqual([
      'DOMAIN,example.com,Proxy',
      'GEOSITE,cn,DIRECT',
      'GEOIP,cn,DIRECT',
      'MATCH,Proxy',
    ])
    expect(result.diagnostics).toEqual([])
  })

  it('warns about rules after MATCH after expansion', () => {
    const result = expandRuleEntries([
      { type: 'rule', rule: { type: 'MATCH', parameters: [], policy: 'Proxy' } },
      {
        type: 'rule',
        rule: { type: 'DOMAIN', parameters: ['later.example'], policy: 'DIRECT' },
      },
    ])

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'RULE_AFTER_MATCH', severity: 'warning' }),
    )
  })
})
