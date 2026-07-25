import { describe, expect, it } from 'vitest'

import { Base64Parser } from './base64-parser.ts'
import { ClashYamlParser } from './clash-yaml-parser.ts'
import { SubscriptionParserRegistry } from './parser-registry.ts'
import { UriListParser } from './uri-list-parser.ts'

describe('ClashYamlParser', () => {
  it('preserves extension fields and removes name from Proxy', () => {
    const result = new ClashYamlParser().parse(`
proxies:
  - name: Hong Kong 1
    type: ss
    server: 2001:db8::1
    port: 443
    cipher: aes-128-gcm
    password: secret
    x-extension:
      enabled: true
`)
    expect(result.diagnostics).toEqual([])
    expect(result.proxies).toEqual([{
      name: 'Hong Kong 1',
      proxy: {
        type: 'ss', server: '2001:db8::1', port: 443, cipher: 'aes-128-gcm', password: 'secret',
        'x-extension': { enabled: true },
      },
    }])
  })
})

describe('UriListParser', () => {
  it('parses supported protocols in input order and reports individual failures', () => {
    const vmess = Buffer.from(JSON.stringify({
      v: '2', ps: 'VMess', add: 'example.com', port: '443', id: 'uuid', aid: '0', net: 'ws', tls: 'tls',
    })).toString('base64url')
    const result = new UriListParser().parse([
      'ss://YWVzLTEyOC1nY206c2VjcmV0@[2001:db8::1]:8388#SS%20IPv6',
      `vmess://${vmess}`,
      'vless://uuid@example.com:443?type=ws&security=tls&host=cdn.example.com&path=%2Fws#VLESS',
      'trojan://secret@example.com:443?sni=cdn.example.com#Trojan',
      'hysteria2://secret@example.com:8443?sni=cdn.example.com#HY2',
      'tuic://uuid:secret@example.com:443?congestion_control=bbr#TUIC',
      'unknown://example.com:1#bad',
    ].join('\n'))

    expect(result.proxies.map((item) => item.name)).toEqual(['SS IPv6', 'VMess', 'VLESS', 'Trojan', 'HY2', 'TUIC'])
    expect(result.proxies[0]?.proxy.server).toBe('2001:db8::1')
    expect(result.diagnostics).toMatchObject([{
      code: 'URI_PROTOCOL_UNSUPPORTED', location: 'lines[7]',
    }])
  })

  it('parses ShadowsocksR URL-safe payload', () => {
    const encoded = Buffer.from('example.com:443:auth_sha1_v4:aes-256-cfb:tls1.2_ticket_auth:c2VjcmV0/?remarks=U1NS').toString('base64url')
    const result = new UriListParser().parse(`ssr://${encoded}`)
    expect(result.proxies[0]).toMatchObject({ name: 'SSR', proxy: { type: 'ssr', password: 'secret' } })
  })
})

describe('Base64Parser and registry', () => {
  it('decodes URL-safe Base64 and delegates to the URI list parser', () => {
    const content = Buffer.from('trojan://secret@example.com:443#One\n').toString('base64url')
    const result = new Base64Parser().parse(content)
    expect(result.format).toBe('base64')
    expect(result.proxies[0]?.name).toBe('One')
  })

  it('chooses Clash, URI list, then Base64 deterministically', () => {
    const registry = new SubscriptionParserRegistry()
    expect(registry.parse('proxies: []').format).toBe('clash')
    expect(registry.parse('trojan://secret@example.com:443').format).toBe('uri-list')
    expect(registry.parse(Buffer.from('trojan://secret@example.com:443').toString('base64')).format).toBe('base64')
  })

  it('decodes UTF-8 Base64 without relying on Node Buffer in the parser', () => {
    const payload = Buffer.from(JSON.stringify({
      ps: '香港节点', add: 'example.com', port: '443', id: 'uuid', aid: '0', net: 'ws', tls: 'tls',
    })).toString('base64url')
    expect(new UriListParser().parse(`vmess://${payload}`).proxies[0]?.name).toBe('香港节点')
  })
})
