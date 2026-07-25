import { describe, expect, it } from 'vitest'

import type { Profile } from '../../../domain/models/profile.ts'
import type { PassthroughProvider } from '../../../domain/models/provider.ts'
import { postgresRowToProvider, profileToPostgresRow, providerToPostgresRow, resolvePostgresProfileRow } from './mappers.ts'

describe('PostgreSQL aggregate mappers', () => {
  it('round-trips camelCase Provider values through JSONB rows', () => {
    const provider: PassthroughProvider = {
      type: 'passthrough', id: 'p1', name: 'Remote', url: 'https://example.com', interval: 3600,
      excludeFilter: 'Expired', excludeType: 'ss|http',
      override: { udpOverTcp: true, skipCertVerify: true }, config: { healthCheck: { enable: true } },
    }
    expect(postgresRowToProvider(providerToPostgresRow(provider))).toEqual(provider)
  })

  it('preserves missing Profile reference shape and order', () => {
    const profile: Profile = {
      id: 'profile', name: 'Profile', tags: [], generalConfig: {}, selectedNodes: [], listeners: [],
      proxyGroups: [], ruleEntries: [], ruleProviders: [], passthroughProviders: [],
    }
    const missing = [{ area: 'ruleEntries' as const, position: 0, id: 'pack', displayName: 'Old Pack' }]
    const row = profileToPostgresRow(profile, missing)
    expect(resolvePostgresProfileRow(row, new Map(), new Map(), new Map(), new Map())).toEqual({ profile, missingReferences: missing })
  })
})
