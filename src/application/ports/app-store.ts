import type { Node, ProviderNode, UserDefinedNode } from '../../domain/models/node.ts'
import type { MissingProfileReference, Profile, ResolvedProfile } from '../../domain/models/profile.ts'
import type { ProxyProvider } from '../../domain/models/provider.ts'
import type { RuleProvider } from '../../domain/models/rule-provider.ts'
import type { RulePack } from '../../domain/models/rule.ts'
import type { User } from '../../domain/models/user.ts'

export type ProviderNodeState = {
  node: ProviderNode
  upstreamKey: string
}

export type StoredSubscriptionToken = {
  id: string
  profileId: string
  note?: string
  tokenHash: string
  encryptedToken: string
}

export type ProfileUpdateInfo = {
  version: number
  updateTime: number
}

export type Awaitable<T> = T | Promise<T>

export interface AppStore {
  getUser(): Awaitable<User | undefined>
  initializeUser(user: User): Awaitable<boolean>
  saveUser(user: User): Awaitable<void>

  listNodes(): Awaitable<Node[]>
  getNode(id: string): Awaitable<Node | undefined>
  saveUserDefinedNode(node: UserDefinedNode): Awaitable<void>
  deleteUserDefinedNode(id: string): Awaitable<boolean>

  listProviders(): Awaitable<ProxyProvider[]>
  getProvider(id: string): Awaitable<ProxyProvider | undefined>
  saveProvider(provider: ProxyProvider): Awaitable<void>
  deleteProvider(id: string): Awaitable<boolean>
  listProviderNodeStates(providerId: string): Awaitable<ProviderNodeState[]>
  replaceProviderNodes(providerId: string, nodes: readonly ProviderNodeState[]): Awaitable<void>

  listRulePacks(): Awaitable<RulePack[]>
  getRulePack(id: string): Awaitable<RulePack | undefined>
  saveRulePack(rulePack: RulePack): Awaitable<void>
  deleteRulePack(id: string): Awaitable<boolean>

  listRuleProviders(): Awaitable<RuleProvider[]>
  getRuleProvider(id: string): Awaitable<RuleProvider | undefined>
  saveRuleProvider(ruleProvider: RuleProvider, previousName?: string): Awaitable<void>
  deleteRuleProvider(id: string): Awaitable<boolean>

  listProfiles(): Awaitable<ResolvedProfile[]>
  getProfile(id: string): Awaitable<ResolvedProfile | undefined>
  getProfileUpdateInfo(id: string): Awaitable<ProfileUpdateInfo | undefined>
  saveProfile(profile: Profile, missingReferences?: readonly MissingProfileReference[]): Awaitable<void>
  deleteProfile(id: string): Awaitable<boolean>
  profileIdsReferencingNode(nodeId: string): Awaitable<string[]>
  profileIdsReferencingProvider(providerId: string): Awaitable<string[]>
  profileIdsReferencingRulePack(rulePackId: string): Awaitable<string[]>

  listSubscriptionTokens(profileId?: string): Awaitable<StoredSubscriptionToken[]>
  getSubscriptionTokenById(id: string): Awaitable<StoredSubscriptionToken | undefined>
  getSubscriptionTokenByHash(tokenHash: string): Awaitable<StoredSubscriptionToken | undefined>
  saveSubscriptionToken(token: StoredSubscriptionToken): Awaitable<void>
  deleteSubscriptionToken(id: string): Awaitable<boolean>

  close(): Awaitable<void>
}
