import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { parse } from 'yaml'

import type { JsonObject, JsonValue } from '../src/domain/json.ts'
import type { Listener, ListenerEntry } from '../src/domain/models/listener.ts'
import type { UserDefinedNode } from '../src/domain/models/node.ts'
import type { Profile } from '../src/domain/models/profile.ts'
import type { PassthroughProvider, ProxyProvider } from '../src/domain/models/provider.ts'
import type { ProxyGroup } from '../src/domain/models/proxy-group.ts'
import type { RuleProvider } from '../src/domain/models/rule-provider.ts'
import type { Rule, RuleEntry } from '../src/domain/models/rule.ts'
import { compileProfile } from '../src/domain/compiler/profile-compiler.ts'
import { isJsonValue } from '../src/domain/json.ts'
import { parseProviderOverride } from '../src/domain/providers/provider-transform.ts'
import { validateProvider } from '../src/domain/providers/provider-validator.ts'
import { validateRuleProviderConfig } from '../src/domain/rule-providers/rule-provider-validator.ts'
import { serializeRule } from '../src/domain/rules/rule-serializer.ts'
import { SqliteStore } from '../src/infrastructure/store/sqlite/sqlite-store.ts'

const reservedProfileFields = new Set([
  'proxies',
  'listeners',
  'proxy-groups',
  'proxy-providers',
  'rule-providers',
  'rules',
])
const anchorFields = new Set(['proxy-anchor', 'proxy-group-anchor', 'rule-anchor'])
const providerFields = new Set([
  'type',
  'url',
  'interval',
  'filter',
  'exclude-filter',
  'exclude-type',
  'override',
])
const ruleModifiers = new Set(['no-resolve'])

const [sourcePath, databasePath, requestedProfileName] = process.argv.slice(2)
if (!sourcePath || !databasePath) {
  throw new Error('Usage: tsx scripts/import-mihomo-profile.ts <config.yml> <database.sqlite> [profile-name]')
}

const sourceName = basename(sourcePath).replace(/\.ya?ml$/i, '')
const sourceDocument = parse(readFileSync(sourcePath, 'utf8'), { merge: true }) as unknown
if (!isJsonObject(sourceDocument)) throw new Error('Mihomo config must be a YAML object')
const { document, normalizations } = normalizeForImport(sourceDocument)

const store = new SqliteStore(databasePath)
try {
  const existingProfiles = store.listProfiles()
  const profileName = requestedProfileName ?? sourceName
  const matchingProfiles = existingProfiles.filter((value) => value.profile.name === profileName)
  if (matchingProfiles.length > 1) throw new Error(`Multiple Profiles are named ${profileName}`)
  const existingProfile = matchingProfiles[0]?.profile

  const nodes = parseNodes(document.proxies, sourceName)
  const passthroughProviders = parseProxyProviders(
    document['proxy-providers'],
    sourceName,
    store.listProviders(),
  )
  const ruleProviders = parseRuleProviders(
    document['rule-providers'],
    sourceName,
    store.listRuleProviders(),
  )
  const profile = createProfile({
    document,
    sourceName,
    profileName,
    existingProfile,
    nodes,
    passthroughProviders,
    ruleProviders,
  })

  const compiled = compileProfile({ profile, missingReferences: [] })
  const errors = compiled.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Profile compile failed: ${errors.map((item) => item.message).join('; ')}`)
  }

  const normalizedSource = structuredClone(document)
  for (const field of anchorFields) delete normalizedSource[field]
  if (!isDeepStrictEqual(compiled.config, normalizedSource)) {
    const mismatchedFields = new Set([
      ...Object.keys(compiled.config),
      ...Object.keys(normalizedSource),
    ])
    const mismatches = [...mismatchedFields].filter((field) =>
      !isDeepStrictEqual(compiled.config[field], normalizedSource[field]),
    )
    throw new Error(`Compiled Profile differs from source fields: ${mismatches.join(', ')}`)
  }

  store.database.transaction(() => {
    for (const node of nodes) store.saveUserDefinedNode(node)
    for (const provider of passthroughProviders) store.saveProvider(provider)
    for (const provider of ruleProviders) store.saveRuleProvider(provider)
    store.saveProfile(profile)
  })()

  console.log(JSON.stringify({
    profile: profile.name,
    profileId: profile.id,
    nodes: nodes.length,
    proxyProviders: passthroughProviders.length,
    proxyGroups: profile.proxyGroups.length,
    listeners: profile.listeners.length,
    ruleProviders: ruleProviders.length,
    rules: profile.ruleEntries.length,
    warnings: compiled.diagnostics.length,
    normalizations,
  }))
} finally {
  store.close()
}

function parseNodes(value: JsonValue | undefined, sourceName: string): UserDefinedNode[] {
  if (!Array.isArray(value)) throw new Error('Mihomo config proxies must be an array')
  return value.map((item, index) => {
    if (!isJsonObject(item)) throw new Error(`Proxy ${index} must be an object`)
    const name = requiredString(item.name, `proxies[${index}].name`)
    const type = requiredString(item.type, `proxies[${index}].type`)
    const proxy = structuredClone(item)
    delete proxy.name
    return {
      type: 'userdefined',
      id: stableId(sourceName, 'node', name),
      name,
      tags: ['mihomo-import'],
      proxy: { ...proxy, type },
    }
  })
}

function parseProxyProviders(
  value: JsonValue | undefined,
  sourceName: string,
  existing: ProxyProvider[],
): PassthroughProvider[] {
  if (!isJsonObject(value)) throw new Error('Mihomo config proxy-providers must be an object')
  return Object.entries(value).map(([name, item]) => {
    if (!isJsonObject(item)) throw new Error(`Proxy Provider ${name} must be an object`)
    if (item.type !== 'http') throw new Error(`Proxy Provider ${name} must use type http`)
    const sameName = existing.find((provider) => provider.name === name)
    if (sameName?.type === 'import') {
      throw new Error(`Proxy Provider ${name} already exists as an Import Provider`)
    }
    const config = structuredClone(item)
    for (const field of providerFields) delete config[field]
    const provider: PassthroughProvider = {
      type: 'passthrough',
      id: sameName?.id ?? stableId(sourceName, 'proxy-provider', name),
      name,
      url: requiredString(item.url, `proxy-providers.${name}.url`),
      interval: requiredPositiveInteger(item.interval, `proxy-providers.${name}.interval`),
      ...(optionalString(item.filter, `proxy-providers.${name}.filter`)),
      ...(optionalString(item['exclude-filter'], `proxy-providers.${name}.exclude-filter`, 'excludeFilter')),
      ...(optionalString(item['exclude-type'], `proxy-providers.${name}.exclude-type`, 'excludeType')),
      ...(item.override === undefined
        ? {}
        : { override: parseProviderOverride(requiredObject(item.override, `proxy-providers.${name}.override`)) }),
      config,
    }
    const errors = validateProvider(provider).filter((diagnostic) => diagnostic.severity === 'error')
    if (errors.length > 0) throw new Error(`Proxy Provider ${name}: ${errors.map((item) => item.message).join('; ')}`)
    return provider
  })
}

function parseRuleProviders(
  value: JsonValue | undefined,
  sourceName: string,
  existing: RuleProvider[],
): RuleProvider[] {
  if (!isJsonObject(value)) throw new Error('Mihomo config rule-providers must be an object')
  return Object.entries(value).map(([name, item]) => {
    const config = requiredObject(item, `rule-providers.${name}`)
    const errors = validateRuleProviderConfig(config).filter((diagnostic) => diagnostic.severity === 'error')
    if (errors.length > 0) throw new Error(`Rule Provider ${name}: ${errors.map((item) => item.message).join('; ')}`)
    return {
      id: existing.find((provider) => provider.name === name)?.id
        ?? stableId(sourceName, 'rule-provider', name),
      name,
      config: structuredClone(config),
    }
  })
}

function createProfile(input: {
  document: JsonObject
  sourceName: string
  profileName: string
  existingProfile: Profile | undefined
  nodes: UserDefinedNode[]
  passthroughProviders: PassthroughProvider[]
  ruleProviders: RuleProvider[]
}): Profile {
  const generalConfig = Object.fromEntries(
    Object.entries(input.document).filter(([field]) =>
      !reservedProfileFields.has(field) && !anchorFields.has(field),
    ),
  )
  const listeners = parseListeners(input.document.listeners)
  const proxyGroups = parseProxyGroups(input.document['proxy-groups'])
  const ruleEntries = parseRules(input.document.rules)
  return {
    id: input.existingProfile?.id ?? stableId(input.sourceName, 'profile', input.profileName),
    name: input.profileName,
    tags: input.existingProfile?.tags ?? ['mihomo-import'],
    ...(input.existingProfile?.note === undefined ? {} : { note: input.existingProfile.note }),
    generalConfig,
    selectedNodes: input.nodes,
    listeners,
    proxyGroups,
    ruleEntries,
    ruleProviders: input.ruleProviders,
    passthroughProviders: input.passthroughProviders,
  }
}

function parseListeners(value: JsonValue | undefined): ListenerEntry[] {
  if (!Array.isArray(value)) throw new Error('Mihomo config listeners must be an array')
  return value.map((item, index) => {
    const listener = requiredObject(item, `listeners[${index}]`)
    requiredString(listener.name, `listeners[${index}].name`)
    requiredString(listener.type, `listeners[${index}].type`)
    return {
      type: 'userdefined',
      listener: listener as Listener,
    }
  })
}

function parseProxyGroups(value: JsonValue | undefined): ProxyGroup[] {
  if (!Array.isArray(value)) throw new Error('Mihomo config proxy-groups must be an array')
  return value.map((item, index) => {
    const group = requiredObject(item, `proxy-groups[${index}]`)
    requiredString(group.name, `proxy-groups[${index}].name`)
    requiredString(group.type, `proxy-groups[${index}].type`)
    return structuredClone(group) as ProxyGroup
  })
}

function parseRules(value: JsonValue | undefined): RuleEntry[] {
  if (!Array.isArray(value)) throw new Error('Mihomo config rules must be an array')
  return value.map((item, index) => {
    if (typeof item !== 'string') throw new Error(`rules[${index}] must be a string`)
    const rule = parseRule(item, index)
    if (serializeRule(rule) !== normalizeRule(item)) {
      throw new Error(`rules[${index}] cannot be represented without changing its value`)
    }
    return { type: 'rule', rule }
  })
}

function parseRule(value: string, index: number): Rule {
  const parts = value.split(',').map((part) => part.trim())
  const type = parts.shift()
  if (!type) throw new Error(`rules[${index}] has no type`)
  const modifiers: string[] = []
  while (parts.length > 0 && ruleModifiers.has(parts.at(-1) ?? '')) modifiers.unshift(parts.pop() as string)
  const policy = parts.pop()
  if (!policy) throw new Error(`rules[${index}] has no policy`)
  return {
    type,
    parameters: parts,
    policy,
    ...(modifiers.length === 0 ? {} : { modifiers }),
  }
}

function normalizeRule(value: string): string {
  return value.split(',').map((part) => part.trim()).join(',')
}

function normalizeForImport(source: JsonObject): { document: JsonObject; normalizations: number } {
  const document = structuredClone(source)
  if (!Array.isArray(document.rules)) return { document, normalizations: 0 }

  let normalizations = 0
  document.rules = document.rules.map((value) => {
    if (typeof value !== 'string') return value
    const parts = value.split(',').map((part) => part.trim())
    if (parts[0]?.toUpperCase() !== 'PROCESS-NAME' || parts.at(-1) !== 'no-resolve') return value
    normalizations += 1
    return parts.slice(0, -1).join(',')
  })
  return { document, normalizations }
}

function optionalString(
  value: JsonValue | undefined,
  location: string,
  property = location.split('.').at(-1) as string,
): Record<string, string> {
  if (value === undefined) return {}
  return { [property]: requiredString(value, location) }
}

function requiredString(value: JsonValue | undefined, location: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${location} must be a non-empty string`)
  return value
}

function requiredPositiveInteger(value: JsonValue | undefined, location: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${location} must be a positive integer`)
  }
  return value
}

function requiredObject(value: JsonValue | undefined, location: string): JsonObject {
  if (!isJsonObject(value)) throw new Error(`${location} must be an object`)
  return structuredClone(value)
}

function isJsonObject(value: unknown): value is JsonObject {
  return isJsonValue(value) && typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stableId(source: string, type: string, name: string): string {
  const bytes = createHash('sha256').update(`${source}\0${type}\0${name}`).digest().subarray(0, 16)
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
