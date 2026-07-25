import { createHash, randomUUID } from 'node:crypto'

import type { ProviderNodeState } from '../ports/app-store.ts'
import type { Proxy } from '../../domain/models/node.ts'
import type { ImportProvider } from '../../domain/models/provider.ts'
import type { ParsedSubscriptionProxy } from '../ports/subscription-parser.ts'

export type ProviderNodeCandidate = {
  original: ParsedSubscriptionProxy
  transformed: ParsedSubscriptionProxy
}

export function matchProviderNodes(
  provider: ImportProvider,
  candidates: readonly ProviderNodeCandidate[],
  previous: readonly ProviderNodeState[],
  createId: () => string = randomUUID,
): ProviderNodeState[] {
  const nameCounts = countNames(candidates)
  const oldByKey = new Map(previous.map((state) => [state.upstreamKey, state]))
  const oldByFingerprint = new Map<string, ProviderNodeState[]>()
  for (const state of previous) {
    const key = fingerprint(state.node.proxy)
    const values = oldByFingerprint.get(key) ?? []
    values.push(state)
    oldByFingerprint.set(key, values)
  }
  const usedIds = new Set<string>()
  const collisionCounts = new Map<string, number>()

  return candidates.map((candidate) => {
    const originalName = candidate.original.name
    const proxyFingerprint = fingerprint(candidate.original.proxy)
    const collision = collisionCounts.get(proxyFingerprint) ?? 0
    collisionCounts.set(proxyFingerprint, collision + 1)
    const upstreamKey = nameCounts.get(originalName) === 1
      ? `name:${originalName}`
      : `fingerprint:${proxyFingerprint}:${collision}`
    let matched = oldByKey.get(upstreamKey)
    if (matched && usedIds.has(matched.node.id)) matched = undefined
    if (!matched) matched = oldByFingerprint.get(proxyFingerprint)?.find((state) => !usedIds.has(state.node.id))
    const id = matched?.node.id ?? createId()
    usedIds.add(id)
    return {
      upstreamKey,
      node: {
        type: 'provider',
        id,
        name: candidate.transformed.name,
        tags: matched?.node.tags ?? [],
        proxy: structuredClone(candidate.transformed.proxy),
        provider,
      },
    }
  })
}

function countNames(candidates: readonly ProviderNodeCandidate[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const candidate of candidates) counts.set(candidate.original.name, (counts.get(candidate.original.name) ?? 0) + 1)
  return counts
}

function fingerprint(proxy: Proxy): string {
  const identityFields = [
    'type', 'server', 'port', 'uuid', 'id', 'username', 'password', 'cipher',
    'protocol', 'public-key', 'private-key', 'peer', 'sni',
  ]
  const identity = Object.fromEntries(identityFields
    .filter((field) => proxy[field] !== undefined)
    .map((field) => [field, proxy[field]]))
  return createHash('sha256').update(stableJson(identity)).digest('base64url')
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}
