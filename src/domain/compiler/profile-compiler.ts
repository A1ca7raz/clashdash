import { stringify } from 'yaml'

import type { Diagnostic } from '../diagnostics.ts'
import type { JsonObject, JsonValue } from '../json.ts'
import type { Listener } from '../models/listener.ts'
import type { Profile, ResolvedProfile } from '../models/profile.ts'
import type { ProxyGroup } from '../models/proxy-group.ts'
import { renderPassthroughProvider } from '../providers/provider-transform.ts'
import { validateRuleProviderConfig } from '../rule-providers/rule-provider-validator.ts'
import { expandRuleEntries } from '../rules/rule-entry-expander.ts'
import { serializeRule } from '../rules/rule-serializer.ts'

const reservedGeneralFields = new Set([
  'proxies',
  'listeners',
  'proxy-groups',
  'proxy-providers',
  'rule-providers',
  'rules',
])

const builtInPolicies = new Set([
  'DIRECT',
  'REJECT',
  'REJECT-DROP',
  'PASS',
  'PASS-RULE',
  'COMPATIBLE',
])

export type ProfileCompileResult = {
  config: JsonObject
  yaml: string
  diagnostics: Diagnostic[]
}

export function compileProfile(input: ResolvedProfile): ProfileCompileResult {
  const diagnostics: Diagnostic[] = []
  const { profile } = input
  const config = compileGeneralConfig(profile, diagnostics)

  diagnostics.push(...missingReferenceDiagnostics(input))
  validateNames(profile, diagnostics)

  const selectedNodeIds = new Set(profile.selectedNodes.map((node) => node.id))
  const nodeNames = new Set(profile.selectedNodes.map((node) => node.name))
  const groupNames = new Set(profile.proxyGroups.map((group) => group.name))
  const providerNames = new Set(profile.passthroughProviders.map((provider) => provider.name))

  const proxies = profile.selectedNodes.map((node) => ({
    name: node.name,
    ...structuredClone(node.proxy),
  }))
  if (proxies.length > 0) config.proxies = proxies

  const listeners = compileListeners(profile, selectedNodeIds, diagnostics)
  if (listeners.length > 0) config.listeners = listeners

  const providers: JsonObject = {}
  for (const [index, provider] of profile.passthroughProviders.entries()) {
    try {
      providers[provider.name] = renderPassthroughProvider(provider)
    } catch (cause) {
      diagnostics.push({
        severity: 'error',
        code: 'PROVIDER_RENDER_FAILED',
        message: cause instanceof Error ? cause.message : 'Unable to render passthrough provider',
        location: `passthroughProviders[${index}]`,
      })
    }
  }
  if (Object.keys(providers).length > 0) config['proxy-providers'] = providers

  const ruleProviders: JsonObject = {}
  const ruleProviderNames = new Set<string>()
  const ruleProviderPaths = new Map<string, number>()
  for (const [index, provider] of profile.ruleProviders.entries()) {
    if (!provider.name) {
      diagnostics.push({
        severity: 'error', code: 'RULE_PROVIDER_NAME_REQUIRED', message: 'Rule Provider name is required',
        location: `ruleProviders[${index}].name`,
      })
    } else if (ruleProviderNames.has(provider.name)) {
      diagnostics.push({
        severity: 'error', code: 'RULE_PROVIDER_NAME_CONFLICT',
        message: `Duplicate Rule Provider name: ${provider.name}`,
        location: `ruleProviders[${index}].name`,
      })
    }
    ruleProviderNames.add(provider.name)
    for (const diagnostic of validateRuleProviderConfig(provider.config)) {
      diagnostics.push({
        ...diagnostic,
        location: `ruleProviders[${index}].${diagnostic.location ?? 'config'}`,
      })
    }
    const path = provider.config.path
    if (typeof path === 'string') {
      const previous = ruleProviderPaths.get(path)
      if (previous !== undefined) {
        diagnostics.push({
          severity: 'error',
          code: 'RULE_PROVIDER_PATH_CONFLICT',
          message: `Rule Provider path is already used: ${path}`,
          location: `ruleProviders[${index}].config.path`,
        })
      } else {
        ruleProviderPaths.set(path, index)
      }
    }
    ruleProviders[provider.name] = structuredClone(provider.config)
  }
  if (Object.keys(ruleProviders).length > 0) config['rule-providers'] = ruleProviders

  validateProxyGroups(profile.proxyGroups, nodeNames, providerNames, diagnostics)
  if (profile.proxyGroups.length > 0) {
    config['proxy-groups'] = profile.proxyGroups.map(copyObjectWithoutUndefined)
  }

  const expanded = expandRuleEntries(profile.ruleEntries)
  diagnostics.push(...expanded.diagnostics)
  const policies = new Set([...builtInPolicies, ...nodeNames, ...groupNames])
  for (const [index, rule] of expanded.rules.entries()) {
    if (!policies.has(rule.policy)) {
      diagnostics.push({
        severity: 'error',
        code: 'RULE_POLICY_NOT_FOUND',
        message: `Rule policy does not exist in this Profile: ${rule.policy}`,
        location: `rules[${index}].policy`,
      })
    }
  }
  if (expanded.rules.length > 0) config.rules = expanded.rules.map(serializeRule)

  return {
    config,
    yaml: stringify(config, { lineWidth: 0 }),
    diagnostics,
  }
}

function compileGeneralConfig(profile: Profile, diagnostics: Diagnostic[]): JsonObject {
  const config = structuredClone(profile.generalConfig)
  for (const field of reservedGeneralFields) {
    if (field in config) {
      diagnostics.push({
        severity: 'error',
        code: 'GENERAL_CONFIG_RESERVED_FIELD',
        message: `${field} is generated by ProfileCompiler and cannot appear in generalConfig`,
        location: `generalConfig.${field}`,
      })
      delete config[field]
    }
  }
  return config
}

function compileListeners(
  profile: Profile,
  selectedNodeIds: ReadonlySet<string>,
  diagnostics: Diagnostic[],
): JsonObject[] {
  const listeners: JsonObject[] = []
  const endpoints = new Map<string, number>()
  const names = new Map<string, number>()

  for (const [index, entry] of profile.listeners.entries()) {
    let listener: Listener | JsonObject | undefined
    if (entry.type === 'userdefined') {
      listener = structuredClone(entry.listener)
    } else if (!selectedNodeIds.has(entry.node.id)) {
      diagnostics.push({
        severity: 'warning',
        code: 'DERIVED_LISTENER_NODE_NOT_SELECTED',
        message: `Derived listener node is not selected: ${entry.node.name}`,
        location: `listeners[${index}]`,
      })
    } else if (!entry.node.listenerTemplate) {
      diagnostics.push({
        severity: 'warning',
        code: 'DERIVED_LISTENER_TEMPLATE_NOT_FOUND',
        message: `Node no longer has a listener template: ${entry.node.name}`,
        location: `listeners[${index}]`,
      })
    } else {
      listener = { ...structuredClone(entry.node.listenerTemplate), name: entry.name }
    }

    if (!listener) continue
    const name = typeof listener.name === 'string' ? listener.name : ''
    const previousName = names.get(name)
    if (name.length === 0 || previousName !== undefined) {
      diagnostics.push({
        severity: 'error',
        code: 'LISTENER_NAME_CONFLICT',
        message: name.length === 0 ? 'Listener name is required' : `Duplicate listener name: ${name}`,
        location: `listeners[${index}].name`,
      })
    } else {
      names.set(name, index)
    }

    const listen = listener.listen
    const port = listener.port
    if (typeof port === 'number') {
      const endpoint = `${typeof listen === 'string' ? listen : '*'}:${port}`
      const previous = endpoints.get(endpoint)
      if (previous !== undefined) {
        diagnostics.push({
          severity: 'error',
          code: 'LISTENER_ENDPOINT_CONFLICT',
          message: `Listener endpoint is already used: ${endpoint}`,
          location: `listeners[${index}]`,
        })
      } else {
        endpoints.set(endpoint, index)
      }
    }
    listeners.push(listener)
  }

  return listeners
}

function validateNames(profile: Profile, diagnostics: Diagnostic[]): void {
  const names = new Map<string, string>()
  const items: Array<[string, string]> = [
    ...profile.selectedNodes.map(
      (node, index): [string, string] => [node.name, `selectedNodes[${index}].name`],
    ),
    ...profile.proxyGroups.map(
      (group, index): [string, string] => [group.name, `proxyGroups[${index}].name`],
    ),
    ...profile.passthroughProviders.map(
      (provider, index): [string, string] => [
        provider.name,
        `passthroughProviders[${index}].name`,
      ],
    ),
  ]

  for (const [name, location] of items) {
    if (name.length === 0) {
      diagnostics.push({ severity: 'error', code: 'NAME_REQUIRED', message: 'Name is required', location })
      continue
    }
    const previous = names.get(name)
    if (previous !== undefined || builtInPolicies.has(name)) {
      diagnostics.push({
        severity: 'error',
        code: 'NAME_CONFLICT',
        message: builtInPolicies.has(name)
          ? `${name} is a built-in Mihomo policy name`
          : `${name} conflicts with ${previous}`,
        location,
      })
    } else {
      names.set(name, location)
    }
  }
}

function validateProxyGroups(
  groups: ProxyGroup[],
  nodeNames: ReadonlySet<string>,
  providerNames: ReadonlySet<string>,
  diagnostics: Diagnostic[],
): void {
  const groupNames = new Set(groups.map((group) => group.name))
  const validProxyReferences = new Set([...builtInPolicies, ...nodeNames, ...groupNames])
  const graph = new Map<string, string[]>()

  for (const [groupIndex, group] of groups.entries()) {
    if (group.type.length === 0) {
      diagnostics.push({
        severity: 'error',
        code: 'PROXY_GROUP_TYPE_REQUIRED',
        message: 'ProxyGroup type is required',
        location: `proxyGroups[${groupIndex}].type`,
      })
    }

    const edges: string[] = []
    for (const [proxyIndex, reference] of (group.proxies ?? []).entries()) {
      if (!validProxyReferences.has(reference)) {
        diagnostics.push({
          severity: 'error',
          code: 'PROXY_GROUP_REFERENCE_NOT_FOUND',
          message: `ProxyGroup reference does not exist: ${reference}`,
          location: `proxyGroups[${groupIndex}].proxies[${proxyIndex}]`,
        })
      }
      if (groupNames.has(reference)) edges.push(reference)
    }
    graph.set(group.name, edges)

    for (const [providerIndex, reference] of (group.use ?? []).entries()) {
      if (!providerNames.has(reference)) {
        diagnostics.push({
          severity: 'error',
          code: 'PROXY_GROUP_PROVIDER_NOT_FOUND',
          message: `ProxyProvider does not exist: ${reference}`,
          location: `proxyGroups[${groupIndex}].use[${providerIndex}]`,
        })
      }
    }
  }

  const cycle = findCycle(graph)
  if (cycle) {
    diagnostics.push({
      severity: 'error',
      code: 'PROXY_GROUP_REFERENCE_CYCLE',
      message: `ProxyGroup reference cycle: ${cycle.join(' -> ')}`,
      location: 'proxyGroups',
    })
  }
}

function findCycle(graph: ReadonlyMap<string, string[]>): string[] | undefined {
  const visited = new Set<string>()
  const active = new Set<string>()
  const path: string[] = []

  function visit(name: string): string[] | undefined {
    if (active.has(name)) {
      const start = path.indexOf(name)
      return [...path.slice(start), name]
    }
    if (visited.has(name)) return undefined

    visited.add(name)
    active.add(name)
    path.push(name)
    for (const next of graph.get(name) ?? []) {
      const cycle = visit(next)
      if (cycle) return cycle
    }
    path.pop()
    active.delete(name)
    return undefined
  }

  for (const name of graph.keys()) {
    const cycle = visit(name)
    if (cycle) return cycle
  }
  return undefined
}

function missingReferenceDiagnostics(input: ResolvedProfile): Diagnostic[] {
  return input.missingReferences.map((reference) => {
    const warning = reference.area === 'selectedNodes' || reference.area === 'listeners'
    const codeByArea = {
      selectedNodes: 'NODE_NOT_FOUND',
      listeners: 'LISTENER_NODE_NOT_FOUND',
      ruleEntries: 'RULE_PACK_NOT_FOUND',
      ruleProviders: 'RULE_PROVIDER_NOT_FOUND',
      passthroughProviders: 'PROVIDER_NOT_FOUND',
    } as const
    return {
      severity: warning ? 'warning' : 'error',
      code: codeByArea[reference.area],
      message: `${reference.displayName ?? reference.id} no longer exists`,
      location: `${reference.area}[${reference.position}]`,
    }
  })
}

function copyObjectWithoutUndefined(value: ProxyGroup): JsonObject {
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, JsonValue] => entry[1] !== undefined)
      .map(([key, item]) => [key, structuredClone(item)]),
  )
}
