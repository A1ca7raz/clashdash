import { seedDemoData } from '../src/application/demo/demo-data-seeder.ts'
import { AesSubscriptionTokenCipher } from '../src/infrastructure/security/aes-subscription-token-cipher.ts'
import { loadServerConfig } from '../src/server/config.ts'
import { openAppStore } from '../src/server/open-app-store.ts'

const config = loadServerConfig(process.env)
const store = await openAppStore(config)
try {
  const result = await seedDemoData(store, new AesSubscriptionTokenCipher(config.tokenKey))
  console.log('Demo data is ready')
  console.log(`Nodes: ${result.nodeCount}; Providers: ${result.providerCount}; RulePacks: ${result.rulePackCount}; RuleProviders: ${result.ruleProviderCount}; Profiles: ${result.profileCount}`)
  console.log(result.subscriptionTokenCreated ? 'Created one demo subscription token' : 'Kept the existing demo subscription token')
} finally {
  await store.close()
}
