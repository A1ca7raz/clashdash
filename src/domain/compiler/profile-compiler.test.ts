import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

import type { Profile, ResolvedProfile } from '../models/profile.ts'
import type { UserDefinedNode } from '../models/node.ts'
import { compileProfile } from './profile-compiler.ts'

const node: UserDefinedNode = {
  id: 'node-1',
  type: 'userdefined',
  name: 'HK 01',
  tags: ['hk'],
  proxy: {
    type: 'hysteria2',
    server: 'hk.example.test',
    port: 443,
    password: 'secret',
  },
  listenerTemplate: {
    type: 'hysteria2',
    listen: '0.0.0.0',
    port: 8443,
    users: { alice: 'secret' },
  },
}

function createProfile(overrides: Partial<Profile> = {}): ResolvedProfile {
  return {
    profile: {
      id: 'profile-1',
      name: 'Default',
      tags: [],
      generalConfig: { 'mixed-port': 7890, mode: 'rule' },
      selectedNodes: [node],
      listeners: [{ type: 'derived', name: 'hy2-in', node }],
      proxyGroups: [
        { name: 'Proxy', type: 'select', proxies: ['HK 01', 'DIRECT'] },
      ],
      ruleEntries: [
        {
          type: 'rulePack',
          rulePack: {
            id: 'pack-1',
            name: 'Direct',
            rules: [{ type: 'DOMAIN-SUFFIX', parameters: ['example.cn'], policy: 'DIRECT' }],
          },
        },
        { type: 'rule', rule: { type: 'MATCH', parameters: [], policy: 'Proxy' } },
      ],
      ruleProviders: [],
      passthroughProviders: [
        {
          id: 'remote',
          type: 'passthrough',
          name: 'Remote',
          url: 'https://example.test/sub',
          interval: 3600,
          excludeFilter: 'Expired',
          config: {},
        },
      ],
      ...overrides,
    },
    missingReferences: [],
  }
}

describe('compileProfile', () => {
  it('compiles a complete deterministic Mihomo document', () => {
    const first = compileProfile(createProfile())
    const second = compileProfile(createProfile())

    expect(first.diagnostics).toEqual([])
    expect(first.yaml).toBe(second.yaml)
    expect(parse(first.yaml ?? '')).toEqual({
      'mixed-port': 7890,
      mode: 'rule',
      proxies: [
        {
          name: 'HK 01',
          type: 'hysteria2',
          server: 'hk.example.test',
          port: 443,
          password: 'secret',
        },
      ],
      listeners: [
        {
          name: 'hy2-in',
          type: 'hysteria2',
          listen: '0.0.0.0',
          port: 8443,
          users: { alice: 'secret' },
        },
      ],
      'proxy-providers': {
        Remote: {
          type: 'http',
          url: 'https://example.test/sub',
          interval: 3600,
          'exclude-filter': 'Expired',
        },
      },
      'proxy-groups': [{ name: 'Proxy', type: 'select', proxies: ['HK 01', 'DIRECT'] }],
      rules: ['DOMAIN-SUFFIX,example.cn,DIRECT', 'MATCH,Proxy'],
    })
  })

  it('reports missing nodes as warnings and invalid group references as errors', () => {
    const input = createProfile({ selectedNodes: [] })
    input.missingReferences.push({
      area: 'selectedNodes',
      position: 0,
      id: 'node-1',
      displayName: 'HK 01',
    })

    const result = compileProfile(input)

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'NODE_NOT_FOUND', severity: 'warning' }),
    )
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'PROXY_GROUP_REFERENCE_NOT_FOUND', severity: 'error' }),
    )
  })

  it('compiles selected Rule Providers without validating RULE-SET references', () => {
    const provider = {
      id: 'rule-provider-1', name: 'RejectDomains',
      config: {
        type: 'http', behavior: 'domain', format: 'yaml', url: 'https://example.test/reject.yaml',
        path: './rules/reject.yaml', interval: 3600,
      },
    }
    const result = compileProfile(createProfile({
      ruleProviders: [provider],
      ruleEntries: [
        { type: 'rule', rule: { type: 'RULE-SET', parameters: [provider.name], policy: 'REJECT' } },
        { type: 'rule', rule: { type: 'MATCH', parameters: [], policy: 'DIRECT' } },
      ],
    }))

    expect(result.diagnostics).toEqual([])
    expect(parse(result.yaml)).toMatchObject({
      'rule-providers': { RejectDomains: provider.config },
      rules: ['RULE-SET,RejectDomains,REJECT', 'MATCH,DIRECT'],
    })

    const unselected = compileProfile(createProfile({
      ruleProviders: [],
      ruleEntries: [{ type: 'rule', rule: { type: 'RULE-SET', parameters: ['Missing'], policy: 'DIRECT' } }],
    }))
    expect(unselected.diagnostics).not.toContainEqual(expect.objectContaining({ code: 'RULE_PROVIDER_NOT_FOUND' }))
    expect(parse(unselected.yaml)).toMatchObject({ rules: ['RULE-SET,Missing,DIRECT'] })
  })

  it('rejects duplicate Rule Provider paths and reserved generalConfig fields', () => {
    const config = {
      type: 'http', behavior: 'domain', url: 'https://example.test/rules.yaml', path: './rules/shared.yaml',
    }
    const result = compileProfile(createProfile({
      generalConfig: { 'rule-providers': { unmanaged: {} } },
      ruleProviders: [
        { id: 'one', name: 'One', config },
        { id: 'two', name: 'Two', config: { ...config, url: 'https://example.test/other.yaml' } },
      ],
    }))
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'GENERAL_CONFIG_RESERVED_FIELD' }),
      expect.objectContaining({ code: 'RULE_PROVIDER_PATH_CONFLICT' }),
    ]))
  })

  it('detects proxy group reference cycles', () => {
    const result = compileProfile(
      createProfile({
        proxyGroups: [
          { name: 'A', type: 'select', proxies: ['B'] },
          { name: 'B', type: 'select', proxies: ['A'] },
        ],
        ruleEntries: [],
      }),
    )

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'PROXY_GROUP_REFERENCE_CYCLE', severity: 'error' }),
    )
  })

  it('rejects generated sections in generalConfig', () => {
    const result = compileProfile(createProfile({ generalConfig: { rules: [] } }))

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'GENERAL_CONFIG_RESERVED_FIELD', severity: 'error' }),
    )
  })
})
