import type {
  ParsedProxy,
  SubscriptionInputFormat,
  SubscriptionParseResult,
} from '../../shared/subscription-parser/index.ts'

export type ParsedSubscriptionProxy = ParsedProxy

export type ParsedSubscription = SubscriptionParseResult

export interface SubscriptionParserPort {
  parse(content: string, format: SubscriptionInputFormat): ParsedSubscription
}
