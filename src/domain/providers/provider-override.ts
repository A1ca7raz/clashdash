import type { JsonValue } from '../json.ts'
import type { ProviderOverride } from '../models/provider.ts'
import { MihomoPattern } from './mihomo-pattern.ts'
import { applyOverrideExpressions } from './override-expression/evaluator.ts'
import type { NamedProxy } from './types.ts'

const fixedFields = {
  tfo: 'tfo',
  mptcp: 'mptcp',
  udp: 'udp',
  udpOverTcp: 'udp-over-tcp',
  up: 'up',
  down: 'down',
  skipCertVerify: 'skip-cert-verify',
  nameCertVerify: 'name-cert-verify',
  dialerProxy: 'dialer-proxy',
  interfaceName: 'interface-name',
  routingMark: 'routing-mark',
  ipVersion: 'ip-version',
} as const

export function applyProviderOverride<T extends NamedProxy>(
  proxy: T,
  override: ProviderOverride | undefined,
): T {
  if (!override) {
    return structuredClone(proxy)
  }
  let output: NamedProxy = structuredClone(proxy)

  for (const [property, mihomoField] of Object.entries(fixedFields)) {
    const value = override[property as keyof typeof fixedFields]
    if (value !== undefined) {
      output[mihomoField] = value as JsonValue
    }
  }

  for (const replacement of override.proxyName ?? []) {
    output.name = new MihomoPattern(replacement.pattern).replace(output.name, replacement.target)
  }
  if (override.additionalPrefix !== undefined) {
    output.name = `${override.additionalPrefix}${output.name}`
  }
  if (override.additionalSuffix !== undefined) {
    output.name = `${output.name}${override.additionalSuffix}`
  }
  if (override.overrideExpr !== undefined) {
    output = applyOverrideExpressions(output, override.overrideExpr) as NamedProxy
  }

  return output as T
}
