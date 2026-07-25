import type { ProviderScheduler } from '../application/ports/provider-scheduler.ts'
import type { ApplicationServices } from '../application/services.ts'
import { AuthService } from '../application/auth/auth-service.ts'
import { NodeService } from '../application/nodes/node-service.ts'
import { ProfileService } from '../application/profiles/profile-service.ts'
import { ProviderRefreshService } from '../application/providers/provider-refresh-service.ts'
import { ProviderService } from '../application/providers/provider-service.ts'
import { RulePackService } from '../application/rule-packs/rule-pack-service.ts'
import { RuleProviderService } from '../application/rule-providers/rule-provider-service.ts'
import { SubscriptionService } from '../application/subscriptions/subscription-service.ts'
import { NodeFetcher } from '../infrastructure/fetch/node-fetcher.ts'
import { SubscriptionParserRegistry } from '../shared/subscription-parser/index.ts'
import { NodeCronScheduler } from '../infrastructure/scheduler/node-cron-scheduler.ts'
import { NoopScheduler } from '../infrastructure/scheduler/noop-scheduler.ts'
import { AesSubscriptionTokenCipher } from '../infrastructure/security/aes-subscription-token-cipher.ts'
import { AesGcmSecretCipher } from '../infrastructure/security/aes-gcm-secret-cipher.ts'
import { JoseAdminTokenService } from '../infrastructure/security/jose-admin-token-service.ts'
import { Rfc6238TotpService } from '../infrastructure/security/rfc6238-totp-service.ts'
import { ScryptPasswordHasher } from '../infrastructure/security/scrypt-password-hasher.ts'
import { loadServerConfig, type ServerConfig } from './config.ts'
import { openAppStore } from './open-app-store.ts'

export type ServerContainer = {
  config: ServerConfig
  services: ApplicationServices
  close(): Promise<void>
}

export async function createServerContainer(environment: NodeJS.ProcessEnv = process.env): Promise<ServerContainer> {
  const config = loadServerConfig(environment)
  const store = await openAppStore(config)

  const parsers = new SubscriptionParserRegistry()
  const refresh = new ProviderRefreshService(store, new NodeFetcher(), parsers)
  const scheduler: ProviderScheduler = config.mode === 'local'
    ? new NodeCronScheduler((providerId) => refresh.refresh(providerId))
    : new NoopScheduler()
  for (const provider of await store.listProviders()) if (provider.type === 'import') scheduler.schedule(provider)
  const passwordHasher = new ScryptPasswordHasher()
  const secretCipher = new AesSubscriptionTokenCipher(config.tokenKey)
  const totpSecretCipher = new AesGcmSecretCipher(config.totpKey)
  if (!await store.getUser()) {
    const passwordHash = await passwordHasher.hash(config.adminPassword)
    await store.initializeUser({ username: config.adminUsername, passwordHash, totpEnabled: false })
  }
  const services: ApplicationServices = {
    auth: new AuthService(
      store,
      passwordHasher,
      new JoseAdminTokenService(config.jwtSecret),
      new Rfc6238TotpService(),
      totpSecretCipher,
    ),
    nodes: new NodeService(store, parsers),
    providers: new ProviderService(store, refresh, undefined, scheduler),
    rulePacks: new RulePackService(store),
    ruleProviders: new RuleProviderService(store),
    profiles: new ProfileService(store),
    subscriptions: new SubscriptionService(store, secretCipher),
  }
  return {
    config,
    services,
    async close() { scheduler.shutdown(); await store.close() },
  }
}
