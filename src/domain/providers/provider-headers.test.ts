import { describe, expect, it } from 'vitest'

import { parseProviderHeaders, renderProviderHeaders } from './provider-headers.ts'
import { validateProvider } from './provider-validator.ts'

describe('Provider headers', () => {
  it('round-trips the Mihomo header mapping', () => {
    const headers = {
      Authorization: ['token 123'],
      'X-Client': ['ClashDash', 'Mihomo'],
    }
    expect(parseProviderHeaders(renderProviderHeaders(headers))).toEqual(headers)
  })

  it('requires non-empty string arrays', () => {
    expect(() => parseProviderHeaders({ Authorization: 'token' })).toThrow('必须是非空字符串数组')
    expect(() => parseProviderHeaders({ Authorization: [] })).toThrow('必须是非空字符串数组')
  })

  it('keeps User-Agent in the dedicated field and rejects duplicate names', () => {
    expect(() => parseProviderHeaders({ 'User-Agent': ['client'] })).toThrow('独立的 User-Agent 字段')
    expect(() => parseProviderHeaders({ Authorization: ['one'], authorization: ['two'] })).toThrow('重复的请求头')
  })

  it('reports invalid request settings through Provider validation', () => {
    const diagnostics = validateProvider({
      type: 'import', id: 'provider', name: 'Provider', url: 'https://example.com', interval: 3600,
      subscriptionFormat: 'clash', userAgent: ' ', headers: { Authorization: [] },
    })
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'PROVIDER_USER_AGENT_INVALID',
      'PROVIDER_HEADERS_INVALID',
    ])
  })
})
