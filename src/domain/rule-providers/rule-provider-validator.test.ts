import { describe, expect, it } from 'vitest'

import { validateRuleProviderConfig } from './rule-provider-validator.ts'

describe('validateRuleProviderConfig', () => {
  it('accepts valid HTTP and Inline Mihomo configurations with extension fields', () => {
    expect(validateRuleProviderConfig({
      type: 'http', behavior: 'domain', format: 'yaml', url: 'https://example.com/domains.yaml',
      interval: 3600, path: './rules/domains.yaml', header: { Authorization: 'Bearer test' },
      'future-field': { enabled: true },
    })).toEqual([])
    expect(validateRuleProviderConfig({
      type: 'inline', behavior: 'classical', payload: ['DOMAIN,example.com', 'IP-CIDR,10.0.0.0/8'],
      'future-field': true,
    })).toEqual([])
  })

  it('rejects missing and type-specific core fields', () => {
    expect(validateRuleProviderConfig({ type: 'http', behavior: 'domain' }))
      .toContainEqual(expect.objectContaining({ code: 'RULE_PROVIDER_FIELD_INVALID', location: 'config.url' }))
    expect(validateRuleProviderConfig({
      type: 'inline', behavior: 'domain', payload: [], url: 'https://example.com', interval: 0,
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'RULE_PROVIDER_PAYLOAD_INVALID' }),
      expect.objectContaining({ code: 'RULE_PROVIDER_FIELD_NOT_ALLOWED', location: 'config.url' }),
      expect.objectContaining({ code: 'RULE_PROVIDER_FIELD_NOT_ALLOWED', location: 'config.interval' }),
    ]))
  })

  it('rejects unsupported types, formats and MRS classical behavior', () => {
    expect(validateRuleProviderConfig({ type: 'file', behavior: 'classical' }))
      .toContainEqual(expect.objectContaining({ code: 'RULE_PROVIDER_TYPE_INVALID' }))
    expect(validateRuleProviderConfig({
      type: 'http', behavior: 'classical', format: 'mrs', url: 'https://example.com/rules.mrs',
    })).toContainEqual(expect.objectContaining({ code: 'RULE_PROVIDER_MRS_BEHAVIOR_INVALID' }))
  })
})
