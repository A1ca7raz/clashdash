import type { AppStore } from '../ports/app-store.ts'
import type { SubscriptionTokenCipher } from '../ports/subscription-token-cipher.ts'
import type { ProviderNode, UserDefinedNode } from '../../domain/models/node.ts'
import type { Profile } from '../../domain/models/profile.ts'
import type { ImportProvider, PassthroughProvider } from '../../domain/models/provider.ts'
import type { RulePack } from '../../domain/models/rule.ts'
import type { RuleProvider } from '../../domain/models/rule-provider.ts'

export const demoDataIds = {
  importProvider: 'demo-provider-airport',
  passthroughProvider: 'demo-provider-public',
  hongKongNode: 'demo-node-hk',
  japanNode: 'demo-node-jp',
  singaporeNode: 'demo-provider-node-sg',
  unitedStatesNode: 'demo-provider-node-us',
  rulePack: 'demo-rule-pack-routing',
  ruleProvider: 'demo-rule-provider-reject',
  profile: 'demo-profile-daily',
  subscriptionToken: 'demo-subscription-phone',
} as const

export type DemoSeedResult = {
  nodeCount: number
  providerCount: number
  rulePackCount: number
  ruleProviderCount: number
  profileCount: number
  subscriptionTokenCreated: boolean
}

export async function seedDemoData(
  store: AppStore,
  tokenCipher: SubscriptionTokenCipher,
): Promise<DemoSeedResult> {
  const importProvider: ImportProvider = {
    type: 'import',
    id: demoDataIds.importProvider,
    name: 'Demo · Airport Import',
    url: 'https://example.com/clash-subscription.yaml',
    interval: 3600,
    subscriptionFormat: 'clash',
    filter: '(香港|日本|新加坡|HK|JP|SG)',
    excludeFilter: '(过期|剩余|Expired)',
    excludeType: 'http|socks5',
    override: {
      udp: true,
      skipCertVerify: true,
      additionalPrefix: '[机场] ',
      proxyName: [{ pattern: '香港', target: 'HK' }, { pattern: '日本', target: 'JP' }],
    },
  }
  const passthroughProvider: PassthroughProvider = {
    type: 'passthrough',
    id: demoDataIds.passthroughProvider,
    name: 'Demo · Public Proxy Provider',
    url: 'https://example.com/mihomo-provider.yaml',
    interval: 7200,
    filter: '(HK|JP|SG|US)',
    excludeFilter: '(Expired|Traffic)',
    override: { udp: true, additionalPrefix: '[公共] ' },
    config: {
      path: './proxy-providers/demo-public.yaml',
      'health-check': {
        enable: true,
        url: 'https://www.gstatic.com/generate_204',
        interval: 300,
        lazy: true,
      },
    },
  }
  await store.saveProvider(importProvider)
  await store.saveProvider(passthroughProvider)

  const ruleProvider: RuleProvider = {
    id: demoDataIds.ruleProvider,
    name: 'Demo · Reject Domains',
    config: {
      type: 'http',
      behavior: 'domain',
      format: 'yaml',
      url: 'https://example.com/reject-domains.yaml',
      path: './ruleset/demo-reject.yaml',
      interval: 86_400,
    },
  }
  await store.saveRuleProvider(ruleProvider)

  const hongKongNode: UserDefinedNode = {
    type: 'userdefined',
    id: demoDataIds.hongKongNode,
    name: 'Demo · HK Hysteria2',
    tags: ['demo', 'hk', 'low-latency'],
    proxy: {
      type: 'hysteria2', server: 'hk.demo.example', port: 443,
      password: 'demo-password', sni: 'hk.demo.example', 'skip-cert-verify': true,
    },
    listenerTemplate: {
      type: 'tunnel', listen: '127.0.0.1', port: 10_080, network: 'tcp',
      target: 'example.com:22', proxy: 'Demo · HK Hysteria2',
    },
  }
  const japanNode: UserDefinedNode = {
    type: 'userdefined',
    id: demoDataIds.japanNode,
    name: 'Demo · JP Shadowsocks',
    tags: ['demo', 'jp', 'stable'],
    proxy: {
      type: 'ss', server: 'jp.demo.example', port: 8443,
      cipher: '2022-blake3-aes-128-gcm', password: 'demo-password', udp: true,
    },
  }
  await store.saveUserDefinedNode(hongKongNode)
  await store.saveUserDefinedNode(japanNode)

  const singaporeNode: ProviderNode = {
    type: 'provider',
    id: demoDataIds.singaporeNode,
    name: '[机场] SG TUIC',
    tags: ['demo', 'sg', 'provider'],
    proxy: {
      type: 'tuic', server: 'sg.demo.example', port: 443,
      uuid: '00000000-0000-4000-8000-000000000001', password: 'demo-password',
      alpn: ['h3'], 'disable-sni': false,
    },
    provider: importProvider,
  }
  const unitedStatesNode: ProviderNode = {
    type: 'provider',
    id: demoDataIds.unitedStatesNode,
    name: '[机场] US Trojan',
    tags: ['demo', 'us', 'provider'],
    proxy: {
      type: 'trojan', server: 'us.demo.example', port: 443,
      password: 'demo-password', sni: 'us.demo.example', udp: true,
    },
    provider: importProvider,
  }
  await store.replaceProviderNodes(importProvider.id, [
    { node: singaporeNode, upstreamKey: 'demo-sg-tuic' },
    { node: unitedStatesNode, upstreamKey: 'demo-us-trojan' },
  ])

  const rulePack: RulePack = {
    id: demoDataIds.rulePack,
    name: 'Demo · 常用分流',
    rules: [
      { type: 'RULE-SET', parameters: [ruleProvider.name], policy: 'REJECT' },
      { type: 'DOMAIN-SUFFIX', parameters: ['github.com'], policy: '🚀 节点选择' },
      { type: 'DOMAIN-SUFFIX', parameters: ['openai.com'], policy: '🚀 节点选择' },
      { type: 'DOMAIN-SUFFIX', parameters: ['bilibili.com'], policy: 'DIRECT' },
      { type: 'GEOIP', parameters: ['CN'], policy: 'DIRECT', modifiers: ['no-resolve'] },
    ],
  }
  await store.saveRulePack(rulePack)

  const profile: Profile = {
    id: demoDataIds.profile,
    name: 'Demo · 日常使用',
    tags: ['demo', 'mihomo', 'ready'],
    note: '包含节点、Provider、Listener、ProxyGroup、RulePack 与内联 Rule 的完整示例。',
    generalConfig: {
      'mixed-port': 7890,
      'allow-lan': true,
      mode: 'rule',
      'log-level': 'info',
      ipv6: false,
      'external-controller': '127.0.0.1:9090',
    },
    selectedNodes: [hongKongNode, japanNode, singaporeNode, unitedStatesNode],
    listeners: [
      { type: 'derived', name: 'Demo SSH Tunnel', node: hongKongNode },
      {
        type: 'userdefined',
        listener: { name: 'Demo Mixed Inbound', type: 'mixed', listen: '127.0.0.1', port: 7891 },
      },
    ],
    proxyGroups: [
      {
        name: '♻️ 自动选择', type: 'url-test',
        proxies: [hongKongNode.name, japanNode.name, singaporeNode.name, unitedStatesNode.name],
        url: 'https://www.gstatic.com/generate_204', interval: 300, tolerance: 80,
      },
      {
        name: '🚀 节点选择', type: 'select',
        proxies: ['♻️ 自动选择', hongKongNode.name, japanNode.name, singaporeNode.name, unitedStatesNode.name, 'DIRECT'],
      },
      { name: '🌐 Provider 节点', type: 'select', use: [passthroughProvider.name] },
    ],
    ruleEntries: [
      { type: 'rulePack', rulePack },
      { type: 'rule', rule: { type: 'DOMAIN-SUFFIX', parameters: ['lan'], policy: 'DIRECT' } },
      { type: 'rule', rule: { type: 'PROCESS-NAME', parameters: ['aria2c'], policy: 'DIRECT' } },
      { type: 'rule', rule: { type: 'MATCH', parameters: [], policy: '🚀 节点选择' } },
    ],
    ruleProviders: [ruleProvider],
    passthroughProviders: [passthroughProvider],
  }
  await store.saveProfile(profile)

  const existingToken = await store.getSubscriptionTokenById(demoDataIds.subscriptionToken)
  if (!existingToken) {
    const token = tokenCipher.generate()
    await store.saveSubscriptionToken({
      id: demoDataIds.subscriptionToken,
      profileId: profile.id,
      note: 'Demo · 手机',
      tokenHash: tokenCipher.hash(token),
      encryptedToken: tokenCipher.encrypt(token),
    })
  }

  return {
    nodeCount: 4,
    providerCount: 2,
    rulePackCount: 1,
    ruleProviderCount: 1,
    profileCount: 1,
    subscriptionTokenCreated: existingToken === undefined,
  }
}
