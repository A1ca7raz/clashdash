import type { AuthService } from './auth/auth-service.ts'
import type { NodeService } from './nodes/node-service.ts'
import type { ProfileService } from './profiles/profile-service.ts'
import type { ProviderService } from './providers/provider-service.ts'
import type { RulePackService } from './rule-packs/rule-pack-service.ts'
import type { RuleProviderService } from './rule-providers/rule-provider-service.ts'
import type { SubscriptionService } from './subscriptions/subscription-service.ts'

export type ApplicationServices = {
  auth: AuthService
  nodes: NodeService
  providers: ProviderService
  rulePacks: RulePackService
  ruleProviders: RuleProviderService
  profiles: ProfileService
  subscriptions: SubscriptionService
}
