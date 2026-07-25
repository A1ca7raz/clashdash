import type { JsonObject, JsonValue } from '../../../domain/json.ts'
import type { Node, ProviderNode, UserDefinedNode } from '../../../domain/models/node.ts'
import type { MissingProfileReference, Profile, ResolvedProfile } from '../../../domain/models/profile.ts'
import type { ProviderOverride, ProxyProvider } from '../../../domain/models/provider.ts'
import type { RuleProvider } from '../../../domain/models/rule-provider.ts'
import type { Rule, RulePack } from '../../../domain/models/rule.ts'
import {
  profileToRow,
  providerNodeToRow,
  providerToRow,
  resolveProfileRow,
  rowToNode,
  rowToProvider,
  userDefinedNodeToRow,
  type NodeRow,
  type ProfileRow,
  type ProviderRow,
} from '../sqlite/mappers.ts'

export type PostgresProviderRow = Omit<ProviderRow, 'override_json' | 'config_json'> & {
  override_json: ProviderOverride | null
  config_json: JsonObject | null
}

export type PostgresNodeRow = Omit<NodeRow, 'tags_json' | 'proxy_json' | 'listener_template_json'> & {
  tags_json: string[]
  proxy_json: JsonObject
  listener_template_json: JsonObject | null
}

export type PostgresProfileRow = Omit<ProfileRow,
  'tags_json' | 'general_config_json' | 'selected_node_ids_json' | 'listeners_json' |
  'proxy_groups_json' | 'rule_entries_json' | 'rule_provider_ids_json' | 'passthrough_provider_ids_json'> & {
  tags_json: string[]
  general_config_json: JsonObject
  selected_node_ids_json: JsonValue[]
  listeners_json: JsonValue[]
  proxy_groups_json: JsonValue[]
  rule_entries_json: JsonValue[]
  rule_provider_ids_json: JsonValue[]
  passthrough_provider_ids_json: JsonValue[]
}

export type PostgresRulePackRow = { id: string; name: string; rules_json: Rule[] }

export function providerToPostgresRow(provider: ProxyProvider): PostgresProviderRow {
  const row = providerToRow(provider)
  return {
    ...row,
    override_json: row.override_json === null ? null : JSON.parse(row.override_json) as ProviderOverride,
    config_json: row.config_json === null ? null : JSON.parse(row.config_json) as JsonObject,
  }
}

export function postgresRowToProvider(row: PostgresProviderRow): ProxyProvider {
  return rowToProvider({
    ...row,
    override_json: row.override_json === null ? null : JSON.stringify(row.override_json),
    config_json: row.config_json === null ? null : JSON.stringify(row.config_json),
  })
}

export function userDefinedNodeToPostgresRow(node: UserDefinedNode): PostgresNodeRow {
  return nodeToPostgresRow(userDefinedNodeToRow(node))
}

export function providerNodeToPostgresRow(node: ProviderNode, upstreamKey: string): PostgresNodeRow {
  return nodeToPostgresRow(providerNodeToRow(node, upstreamKey))
}

export function postgresRowToNode(row: PostgresNodeRow, provider?: ProxyProvider): Node {
  return rowToNode({
    ...row,
    tags_json: JSON.stringify(row.tags_json),
    proxy_json: JSON.stringify(row.proxy_json),
    listener_template_json: row.listener_template_json === null ? null : JSON.stringify(row.listener_template_json),
  }, provider)
}

export function profileToPostgresRow(
  profile: Profile,
  missingReferences: readonly MissingProfileReference[] = [],
): PostgresProfileRow {
  const row = profileToRow(profile, missingReferences)
  return {
    ...row,
    tags_json: JSON.parse(row.tags_json) as string[],
    general_config_json: JSON.parse(row.general_config_json) as JsonObject,
    selected_node_ids_json: JSON.parse(row.selected_node_ids_json) as JsonValue[],
    listeners_json: JSON.parse(row.listeners_json) as JsonValue[],
    proxy_groups_json: JSON.parse(row.proxy_groups_json) as JsonValue[],
    rule_entries_json: JSON.parse(row.rule_entries_json) as JsonValue[],
    rule_provider_ids_json: JSON.parse(row.rule_provider_ids_json) as JsonValue[],
    passthrough_provider_ids_json: JSON.parse(row.passthrough_provider_ids_json) as JsonValue[],
  }
}

export function resolvePostgresProfileRow(
  row: PostgresProfileRow,
  nodes: ReadonlyMap<string, Node>,
  providers: ReadonlyMap<string, ProxyProvider>,
  rulePacks: ReadonlyMap<string, RulePack>,
  ruleProviders: ReadonlyMap<string, RuleProvider>,
): ResolvedProfile {
  return resolveProfileRow({
    ...row,
    tags_json: JSON.stringify(row.tags_json),
    general_config_json: JSON.stringify(row.general_config_json),
    selected_node_ids_json: JSON.stringify(row.selected_node_ids_json),
    listeners_json: JSON.stringify(row.listeners_json),
    proxy_groups_json: JSON.stringify(row.proxy_groups_json),
    rule_entries_json: JSON.stringify(row.rule_entries_json),
    rule_provider_ids_json: JSON.stringify(row.rule_provider_ids_json),
    passthrough_provider_ids_json: JSON.stringify(row.passthrough_provider_ids_json),
  }, nodes, providers, rulePacks, ruleProviders)
}

function nodeToPostgresRow(row: NodeRow): PostgresNodeRow {
  return {
    ...row,
    tags_json: JSON.parse(row.tags_json) as string[],
    proxy_json: JSON.parse(row.proxy_json) as JsonObject,
    listener_template_json: row.listener_template_json === null ? null : JSON.parse(row.listener_template_json) as JsonObject,
  }
}
