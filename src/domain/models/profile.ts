import type { JsonObject } from '../json.ts'
import type { ListenerEntry } from './listener.ts'
import type { Node } from './node.ts'
import type { PassthroughProvider } from './provider.ts'
import type { ProxyGroup } from './proxy-group.ts'
import type { RuleProvider } from './rule-provider.ts'
import type { RuleEntry } from './rule.ts'

export type Profile = {
  id: string
  name: string
  tags: string[]
  note?: string
  generalConfig: JsonObject
  selectedNodes: Node[]
  listeners: ListenerEntry[]
  proxyGroups: ProxyGroup[]
  ruleEntries: RuleEntry[]
  ruleProviders: RuleProvider[]
  passthroughProviders: PassthroughProvider[]
}

export type MissingProfileReference = {
  area: 'selectedNodes' | 'listeners' | 'ruleEntries' | 'ruleProviders' | 'passthroughProviders'
  position: number
  id: string
  displayName?: string
}

export type ResolvedProfile = {
  profile: Profile
  missingReferences: MissingProfileReference[]
}
