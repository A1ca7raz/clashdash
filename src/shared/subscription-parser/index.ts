import { SubscriptionParserRegistry } from './parser-registry.ts'
import type { SubscriptionInputFormat, SubscriptionParseResult } from './types.ts'

export type {
  ParsedProxy,
  SubscriptionFormat,
  SubscriptionInputFormat,
  SubscriptionParseResult,
  SubscriptionParser,
} from './types.ts'
export { Base64Parser } from './base64-parser.ts'
export { ClashYamlParser } from './clash-yaml-parser.ts'
export { SubscriptionParserRegistry } from './parser-registry.ts'
export { UriListParser } from './uri-list-parser.ts'

const defaultRegistry = new SubscriptionParserRegistry()

export function parseSubscription(
  content: string,
  format?: SubscriptionInputFormat,
): SubscriptionParseResult {
  return format === undefined
    ? defaultRegistry.parse(content)
    : defaultRegistry.parse(content, format)
}
