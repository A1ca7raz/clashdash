import type { JsonObject, JsonValue } from '../../../domain/json.ts'
import type { Listener, ListenerEntry } from '../../../domain/models/listener.ts'
import type { Node, ProviderNode, Proxy, UserDefinedNode } from '../../../domain/models/node.ts'
import type { MissingProfileReference, Profile, ResolvedProfile } from '../../../domain/models/profile.ts'
import type { ProviderHeaders, ProviderOverride, ProxyProvider } from '../../../domain/models/provider.ts'
import type { ProxyGroup } from '../../../domain/models/proxy-group.ts'
import type { RuleProvider } from '../../../domain/models/rule-provider.ts'
import type { Rule, RuleEntry, RulePack } from '../../../domain/models/rule.ts'

export type ProviderRow = {
  id: string
  type: 'passthrough' | 'import'
  name: string
  url: string
  interval: number
  subscription_format: 'clash' | 'uri' | 'base64' | null
  filter: string | null
  exclude_filter: string | null
  exclude_type: string | null
  user_agent: string | null
  headers_json: string | null
  override_json: string | null
  config_json: string | null
}

export type NodeRow = {
  id: string
  type: 'userdefined' | 'provider'
  name: string
  tags_json: string
  proxy_json: string
  listener_template_json: string | null
  provider_id: string | null
  upstream_key: string | null
}

export type ProfileRow = {
  id: string
  name: string
  tags_json: string
  note: string | null
  general_config_json: string
  selected_node_ids_json: string
  listeners_json: string
  proxy_groups_json: string
  rule_entries_json: string
  rule_provider_ids_json: string
  passthrough_provider_ids_json: string
}

type StoredReference = { id: string; displayName?: string }
type StoredListener =
  | { type: 'userdefined'; listener: Listener }
  | { type: 'derived'; name: string; node: StoredReference }
type StoredRuleEntry =
  | { type: 'rule'; rule: Rule }
  | { type: 'rulePack'; rulePack: StoredReference }

export function encodeJson(value: JsonValue): string {
  return JSON.stringify(sortJson(value))
}

export function decodeJson<T>(value: string): T {
  return JSON.parse(value) as T
}

export function providerToRow(provider: ProxyProvider): ProviderRow {
  return {
    id: provider.id,
    type: provider.type,
    name: provider.name,
    url: provider.url,
    interval: provider.interval,
    subscription_format: provider.type === 'import' ? provider.subscriptionFormat : null,
    filter: provider.filter ?? null,
    exclude_filter: provider.excludeFilter ?? null,
    exclude_type: provider.excludeType ?? null,
    user_agent: provider.type === 'import' ? provider.userAgent ?? null : null,
    headers_json: provider.type === 'import' && provider.headers !== undefined
      ? encodeJson(provider.headers)
      : null,
    override_json: provider.override === undefined ? null : encodeJson(provider.override as JsonValue),
    config_json: provider.type === 'passthrough' ? encodeJson(provider.config) : null,
  }
}

export function rowToProvider(row: ProviderRow): ProxyProvider {
  const common = {
    id: row.id,
    name: row.name,
    url: row.url,
    interval: row.interval,
    ...(row.filter === null ? {} : { filter: row.filter }),
    ...(row.exclude_filter === null ? {} : { excludeFilter: row.exclude_filter }),
    ...(row.exclude_type === null ? {} : { excludeType: row.exclude_type }),
    ...(row.override_json === null ? {} : { override: decodeJson<ProviderOverride>(row.override_json) }),
  }
  if (row.type === 'import') {
    if (row.subscription_format === null) throw new Error(`Import provider ${row.id} has no format`)
    return {
      type: 'import',
      ...common,
      subscriptionFormat: row.subscription_format,
      ...(row.user_agent === null ? {} : { userAgent: row.user_agent }),
      ...(row.headers_json === null ? {} : { headers: decodeJson<ProviderHeaders>(row.headers_json) }),
    }
  }
  if (row.config_json === null) throw new Error(`Passthrough provider ${row.id} has no config`)
  return { type: 'passthrough', ...common, config: decodeJson(row.config_json) }
}

export function userDefinedNodeToRow(node: UserDefinedNode): NodeRow {
  return {
    id: node.id,
    type: 'userdefined',
    name: node.name,
    tags_json: encodeJson(node.tags),
    proxy_json: encodeJson(node.proxy),
    listener_template_json: node.listenerTemplate === undefined ? null : encodeJson(node.listenerTemplate),
    provider_id: null,
    upstream_key: null,
  }
}

export function providerNodeToRow(node: ProviderNode, upstreamKey: string): NodeRow {
  return {
    id: node.id,
    type: 'provider',
    name: node.name,
    tags_json: encodeJson(node.tags),
    proxy_json: encodeJson(node.proxy),
    listener_template_json: null,
    provider_id: node.provider.id,
    upstream_key: upstreamKey,
  }
}

export function rowToNode(row: NodeRow, provider?: ProxyProvider): Node {
  const common = {
    id: row.id,
    name: row.name,
    tags: decodeJson<string[]>(row.tags_json),
    proxy: decodeJson<Proxy>(row.proxy_json),
  }
  if (row.type === 'userdefined') {
    return {
      type: 'userdefined',
      ...common,
      ...(row.listener_template_json === null
        ? {}
        : { listenerTemplate: decodeJson(row.listener_template_json) }),
    }
  }
  if (provider?.type !== 'import') throw new Error(`Provider node ${row.id} has no import provider`)
  return { type: 'provider', ...common, provider }
}

export function profileToRow(
  profile: Profile,
  missingReferences: readonly MissingProfileReference[] = [],
): ProfileRow {
  const missing = (area: MissingProfileReference['area']) =>
    missingReferences.filter((reference) => reference.area === area)

  const selectedNodes = mergeMissing(
    profile.selectedNodes.map((node): StoredReference => ({ id: node.id, displayName: node.name })),
    missing('selectedNodes'),
    storedReference,
  )
  const listeners = mergeMissing(
    profile.listeners.map((entry): JsonValue => entry.type === 'userdefined'
      ? structuredClone(entry) as JsonValue
      : { type: 'derived', name: entry.name, node: { id: entry.node.id, displayName: entry.node.name } }),
    missing('listeners'),
    (reference) => ({
      type: 'derived',
      name: reference.displayName ?? reference.id,
      node: storedReference(reference),
    }),
  )
  const ruleEntries = mergeMissing(
    profile.ruleEntries.map((entry): JsonValue => entry.type === 'rule'
      ? structuredClone(entry) as JsonValue
      : { type: 'rulePack', rulePack: { id: entry.rulePack.id, displayName: entry.rulePack.name } }),
    missing('ruleEntries'),
    (reference) => ({ type: 'rulePack', rulePack: storedReference(reference) }),
  )
  const providers = mergeMissing(
    profile.passthroughProviders.map((provider): StoredReference => ({ id: provider.id, displayName: provider.name })),
    missing('passthroughProviders'),
    storedReference,
  )
  const ruleProviders = mergeMissing(
    profile.ruleProviders.map((provider): StoredReference => ({ id: provider.id, displayName: provider.name })),
    missing('ruleProviders'),
    storedReference,
  )

  return {
    id: profile.id,
    name: profile.name,
    tags_json: encodeJson(profile.tags),
    note: profile.note ?? null,
    general_config_json: encodeJson(profile.generalConfig),
    selected_node_ids_json: encodeJson(selectedNodes),
    listeners_json: encodeJson(listeners),
    proxy_groups_json: encodeJson(profile.proxyGroups as JsonValue),
    rule_entries_json: encodeJson(ruleEntries),
    rule_provider_ids_json: encodeJson(ruleProviders),
    passthrough_provider_ids_json: encodeJson(providers),
  }
}

export function resolveProfileRow(
  row: ProfileRow,
  nodes: ReadonlyMap<string, Node>,
  providers: ReadonlyMap<string, ProxyProvider>,
  rulePacks: ReadonlyMap<string, RulePack>,
  ruleProviders: ReadonlyMap<string, RuleProvider>,
): ResolvedProfile {
  const missingReferences: MissingProfileReference[] = []
  const selectedNodes: Node[] = []
  for (const [position, reference] of decodeJson<StoredReference[]>(row.selected_node_ids_json).entries()) {
    const node = nodes.get(reference.id)
    if (node) selectedNodes.push(node)
    else missingReferences.push(missingReference('selectedNodes', position, reference))
  }

  const listeners: ListenerEntry[] = []
  for (const [position, entry] of decodeJson<StoredListener[]>(row.listeners_json).entries()) {
    if (entry.type === 'userdefined') {
      listeners.push(entry as unknown as ListenerEntry)
      continue
    }
    const node = nodes.get(entry.node.id)
    if (node?.type === 'userdefined') listeners.push({ type: 'derived', name: entry.name, node })
    else missingReferences.push(missingReference('listeners', position, {
      id: entry.node.id,
      displayName: entry.name,
    }))
  }

  const ruleEntries: RuleEntry[] = []
  for (const [position, entry] of decodeJson<StoredRuleEntry[]>(row.rule_entries_json).entries()) {
    if (entry.type === 'rule') ruleEntries.push(entry)
    else {
      const rulePack = rulePacks.get(entry.rulePack.id)
      if (rulePack) ruleEntries.push({ type: 'rulePack', rulePack })
      else missingReferences.push(missingReference('ruleEntries', position, entry.rulePack))
    }
  }

  const passthroughProviders = []
  for (const [position, reference] of decodeJson<StoredReference[]>(row.passthrough_provider_ids_json).entries()) {
    const provider = providers.get(reference.id)
    if (provider?.type === 'passthrough') passthroughProviders.push(provider)
    else missingReferences.push(missingReference('passthroughProviders', position, reference))
  }

  const selectedRuleProviders: RuleProvider[] = []
  for (const [position, reference] of decodeJson<StoredReference[]>(row.rule_provider_ids_json).entries()) {
    const provider = ruleProviders.get(reference.id)
    if (provider) selectedRuleProviders.push(provider)
    else missingReferences.push(missingReference('ruleProviders', position, reference))
  }

  return {
    profile: {
      id: row.id,
      name: row.name,
      tags: decodeJson(row.tags_json),
      ...(row.note === null ? {} : { note: row.note }),
      generalConfig: decodeJson<JsonObject>(row.general_config_json),
      selectedNodes,
      listeners,
      proxyGroups: decodeJson<ProxyGroup[]>(row.proxy_groups_json),
      ruleEntries,
      ruleProviders: selectedRuleProviders,
      passthroughProviders,
    },
    missingReferences,
  }
}

function mergeMissing<T extends JsonValue>(
  present: readonly T[],
  missing: readonly MissingProfileReference[],
  missingToValue: (reference: MissingProfileReference) => JsonValue,
): JsonValue[] {
  if (missing.length === 0) return structuredClone([...present])
  const positions = new Map(missing.map((reference) => [reference.position, reference]))
  const result: JsonValue[] = []
  let presentIndex = 0
  const length = present.length + missing.length
  for (let position = 0; position < length; position += 1) {
    const reference = positions.get(position)
    if (reference) {
      result.push(missingToValue(reference))
    } else {
      const value = present[presentIndex]
      if (value !== undefined) result.push(structuredClone(value))
      presentIndex += 1
    }
  }
  return result
}

function storedReference(reference: Pick<MissingProfileReference, 'id' | 'displayName'>): StoredReference {
  return {
    id: reference.id,
    ...(reference.displayName === undefined ? {} : { displayName: reference.displayName }),
  }
}

function missingReference(
  area: MissingProfileReference['area'],
  position: number,
  reference: StoredReference,
): MissingProfileReference {
  return {
    area,
    position,
    id: reference.id,
    ...(reference.displayName === undefined ? {} : { displayName: reference.displayName }),
  }
}

function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortJson)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJson(item)]),
  )
}
