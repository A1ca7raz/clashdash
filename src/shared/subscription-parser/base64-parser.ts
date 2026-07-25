import { decodeBase64 } from './uri/helpers.ts'
import { UriListParser } from './uri-list-parser.ts'
import type { SubscriptionParseResult, SubscriptionParser } from './types.ts'

export class Base64Parser implements SubscriptionParser {
  readonly format = 'base64' as const

  constructor(private readonly uriListParser = new UriListParser()) {}

  canParse(content: string): boolean {
    try {
      return this.uriListParser.canParse(decodeBase64(content.trim()))
    } catch {
      return false
    }
  }

  parse(content: string): SubscriptionParseResult {
    try {
      const result = this.uriListParser.parse(decodeBase64(content.trim()))
      return { ...result, format: this.format }
    } catch (cause) {
      return {
        format: this.format,
        proxies: [],
        diagnostics: [{
          severity: 'error',
          code: 'BASE64_INVALID',
          message: cause instanceof Error ? cause.message : 'Invalid Base64 subscription',
        }],
      }
    }
  }
}
