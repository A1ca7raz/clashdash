import { Base64Parser } from './base64-parser.ts'
import { ClashYamlParser } from './clash-yaml-parser.ts'
import type { SubscriptionInputFormat, SubscriptionParseResult, SubscriptionParser } from './types.ts'
import { UriListParser } from './uri-list-parser.ts'

export class SubscriptionParserRegistry {
  readonly parsers: readonly SubscriptionParser[]

  constructor(parsers?: readonly SubscriptionParser[]) {
    const uriList = new UriListParser()
    this.parsers = parsers ?? [new ClashYamlParser(), uriList, new Base64Parser(uriList)]
  }

  parse(content: string): SubscriptionParseResult
  parse(content: string, format: SubscriptionInputFormat): SubscriptionParseResult
  parse(content: string, format?: SubscriptionInputFormat): SubscriptionParseResult {
    if (format !== undefined) {
      const parserFormat = format === 'uri' ? 'uri-list' : format
      const parser = this.parsers.find((candidate) => candidate.format === parserFormat)
      if (!parser) {
        return {
          format: parserFormat,
          proxies: [],
          diagnostics: [{
            severity: 'error', code: 'SUBSCRIPTION_PARSER_NOT_FOUND',
            message: `No subscription parser is registered for ${format}`,
          }],
        }
      }
      return parser.parse(content)
    }
    const parser = this.parsers.find((candidate) => candidate.canParse(content))
    if (parser) return parser.parse(content)
    return {
      format: 'uri-list',
      proxies: [],
      diagnostics: [{
        severity: 'error',
        code: 'SUBSCRIPTION_FORMAT_UNSUPPORTED',
        message: 'Input is not recognized as Clash YAML, a proxy URI list, or a Base64 URI list',
      }],
    }
  }
}
