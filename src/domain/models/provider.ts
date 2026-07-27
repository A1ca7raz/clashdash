import type { JsonObject } from '../json.ts'

export type ProviderOverride = {
  tfo?: boolean
  mptcp?: boolean
  udp?: boolean
  udpOverTcp?: boolean
  up?: string
  down?: string
  skipCertVerify?: boolean
  nameCertVerify?: string
  dialerProxy?: string
  interfaceName?: string
  routingMark?: number
  ipVersion?: string
  additionalPrefix?: string
  additionalSuffix?: string
  proxyName?: Array<{
    pattern: string
    target: string
  }>
  overrideExpr?: string[]
}

export type ProviderHeaders = Record<string, string[]>

export type ProviderBase = {
  id: string
  name: string
  url: string
  interval: number
  filter?: string
  excludeFilter?: string
  excludeType?: string
  override?: ProviderOverride
}

export type PassthroughProvider = ProviderBase & {
  type: 'passthrough'
  config: JsonObject
}

export type ImportProvider = ProviderBase & {
  type: 'import'
  subscriptionFormat: 'clash' | 'uri' | 'base64'
  userAgent?: string
  headers?: ProviderHeaders
}

export type ProxyProvider = PassthroughProvider | ImportProvider
