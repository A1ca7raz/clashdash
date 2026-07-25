import type { Diagnostic } from '../../domain/diagnostics.ts'
import { parseHysteria2Uri } from './uri/hysteria2.ts'
import { parseShadowsocksUri } from './uri/shadowsocks.ts'
import { parseShadowsocksrUri } from './uri/shadowsocksr.ts'
import { parseTrojanUri } from './uri/trojan.ts'
import { parseTuicUri } from './uri/tuic.ts'
import { parseVlessUri } from './uri/vless.ts'
import { parseVmessUri } from './uri/vmess.ts'
import type { ParsedProxy, SubscriptionParseResult, SubscriptionParser } from './types.ts'

type UriParser = (input: string) => ParsedProxy

const uriParsers: Readonly<Record<string, UriParser>> = {
  ss: parseShadowsocksUri,
  ssr: parseShadowsocksrUri,
  vmess: parseVmessUri,
  vless: parseVlessUri,
  trojan: parseTrojanUri,
  hysteria2: parseHysteria2Uri,
  hy2: parseHysteria2Uri,
  tuic: parseTuicUri,
}

export class UriListParser implements SubscriptionParser {
  readonly format = 'uri-list' as const

  canParse(content: string): boolean {
    return content.split(/\r?\n/).some((line) => /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(line.trim()))
  }

  parse(content: string): SubscriptionParseResult {
    const proxies: ParsedProxy[] = []
    const diagnostics: Diagnostic[] = []
    for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const match = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//.exec(line)
      const protocol = match?.[1]?.toLowerCase()
      const parser = protocol ? uriParsers[protocol] : undefined
      if (!parser) {
        diagnostics.push({
          severity: 'error',
          code: protocol ? 'URI_PROTOCOL_UNSUPPORTED' : 'URI_INVALID',
          message: protocol ? `Unsupported proxy URI protocol: ${protocol}` : 'Invalid proxy URI',
          location: `lines[${index + 1}]`,
        })
        continue
      }
      try {
        proxies.push(parser(line))
      } catch (cause) {
        diagnostics.push({
          severity: 'error',
          code: 'URI_PROXY_INVALID',
          message: cause instanceof Error ? cause.message : 'Invalid proxy URI',
          location: `lines[${index + 1}]`,
        })
      }
    }
    return { format: this.format, proxies, diagnostics }
  }
}
