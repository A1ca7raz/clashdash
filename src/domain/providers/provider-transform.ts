import type { JsonObject, JsonValue } from '../json.ts'
import type {
  ImportProvider,
  PassthroughProvider,
  ProviderOverride,
} from '../models/provider.ts'
import { filterProviderProxies } from './provider-filter.ts'
import { applyProviderOverride } from './provider-override.ts'
import type { NamedProxy } from './types.ts'

const reservedConfigFields = new Set([
  'name',
  'type',
  'url',
  'interval',
  'filter',
  'exclude-filter',
  'exclude-type',
  'override',
])

const overrideScalarFields = [
  ['tfo', 'tfo', 'boolean'],
  ['mptcp', 'mptcp', 'boolean'],
  ['udp', 'udp', 'boolean'],
  ['udpOverTcp', 'udp-over-tcp', 'boolean'],
  ['up', 'up', 'string'],
  ['down', 'down', 'string'],
  ['skipCertVerify', 'skip-cert-verify', 'boolean'],
  ['nameCertVerify', 'name-cert-verify', 'string'],
  ['dialerProxy', 'dialer-proxy', 'string'],
  ['interfaceName', 'interface-name', 'string'],
  ['routingMark', 'routing-mark', 'number'],
  ['ipVersion', 'ip-version', 'string'],
  ['additionalPrefix', 'additional-prefix', 'string'],
  ['additionalSuffix', 'additional-suffix', 'string'],
] as const satisfies ReadonlyArray<[
  keyof ProviderOverride,
  string,
  'boolean' | 'number' | 'string',
]>

const overrideCamelCaseAliases = new Map<string, string>([
  ...overrideScalarFields
    .filter(([property, field]) => property !== field)
    .map(([property, field]) => [property, field] as const),
  ['proxyName', 'proxy-name'],
  ['overrideExpr', 'override-expr'],
])

const overrideMihomoFields = new Set([
  ...overrideScalarFields.map(([, field]) => field),
  'proxy-name',
  'override-expr',
])

export function transformImportedProxies<T extends NamedProxy>(
  proxies: readonly T[],
  provider: ImportProvider,
): T[] {
  return filterProviderProxies(proxies, provider).map((proxy) =>
    applyProviderOverride(proxy, provider.override),
  )
}

export function renderPassthroughProvider(provider: PassthroughProvider): JsonObject {
  for (const key of Object.keys(provider.config)) {
    if (reservedConfigFields.has(key)) {
      throw new Error(`Passthrough provider config contains reserved field: ${key}`)
    }
  }

  const output: JsonObject = {
    type: 'http',
    url: provider.url,
    interval: provider.interval,
  }

  if (provider.filter !== undefined) output.filter = provider.filter
  if (provider.excludeFilter !== undefined) output['exclude-filter'] = provider.excludeFilter
  if (provider.excludeType !== undefined) output['exclude-type'] = provider.excludeType
  if (provider.override !== undefined) output.override = renderProviderOverride(provider.override)

  Object.assign(output, structuredClone(provider.config))
  return output
}

export function renderProviderOverride(override: ProviderOverride): JsonObject {
  const output: JsonObject = {}

  for (const [property, field] of overrideScalarFields) {
    const value = override[property]
    if (value !== undefined) output[field] = value as JsonValue
  }
  if (override.proxyName !== undefined) {
    output['proxy-name'] = override.proxyName.map(({ pattern, target }) => ({ pattern, target }))
  }
  if (override.overrideExpr !== undefined) {
    output['override-expr'] = [...override.overrideExpr]
  }

  return output
}

export function parseProviderOverride(input: JsonObject): ProviderOverride {
  for (const field of Object.keys(input)) {
    const mihomoField = overrideCamelCaseAliases.get(field)
    if (mihomoField !== undefined) {
      throw new Error(`Override YAML 请使用 Mihomo 字段 "${mihomoField}"，不要使用 "${field}"`)
    }
    if (!overrideMihomoFields.has(field)) {
      throw new Error(`Override YAML 包含未知的 Mihomo 字段: ${field}`)
    }
  }

  const output: ProviderOverride = {}
  for (const [property, field, expectedType] of overrideScalarFields) {
    const value = input[field]
    if (value === undefined) continue
    if (typeof value !== expectedType) {
      throw new Error(`Override YAML 字段 "${field}" 必须是 ${expectedType}`)
    }
    Object.assign(output, { [property]: value })
  }

  const proxyName = input['proxy-name']
  if (proxyName !== undefined) {
    if (!Array.isArray(proxyName)) {
      throw new Error('Override YAML 字段 "proxy-name" 必须是数组')
    }
    output.proxyName = proxyName.map((entry, index) => {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error(`Override YAML 字段 "proxy-name[${index}]" 必须是对象`)
      }
      if (
        Object.keys(entry).some((key) => key !== 'pattern' && key !== 'target') ||
        typeof entry.pattern !== 'string' ||
        typeof entry.target !== 'string'
      ) {
        throw new Error(`Override YAML 字段 "proxy-name[${index}]" 必须且只能包含字符串 pattern 和 target`)
      }
      return { pattern: entry.pattern, target: entry.target }
    })
  }

  const overrideExpr = input['override-expr']
  if (overrideExpr !== undefined) {
    if (!Array.isArray(overrideExpr) || overrideExpr.some((entry) => typeof entry !== 'string')) {
      throw new Error('Override YAML 字段 "override-expr" 必须是字符串数组')
    }
    output.overrideExpr = overrideExpr.map((entry) => entry as string)
  }

  return output
}
