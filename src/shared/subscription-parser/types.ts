import type { Diagnostic } from '../../domain/diagnostics.ts'
import type { Proxy } from '../../domain/models/node.ts'

export type ParsedProxy = {
  name: string
  proxy: Proxy
}

export type SubscriptionFormat = 'clash' | 'uri-list' | 'base64'

export type SubscriptionInputFormat = 'clash' | 'uri' | 'base64'

export type SubscriptionParseResult = {
  format: SubscriptionFormat
  proxies: ParsedProxy[]
  diagnostics: Diagnostic[]
}

export type SubscriptionParser = {
  readonly format: SubscriptionFormat
  canParse(content: string): boolean
  parse(content: string): SubscriptionParseResult
}
