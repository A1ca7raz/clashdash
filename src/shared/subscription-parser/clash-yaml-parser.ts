import { parse } from 'yaml'

import type { Diagnostic } from '../../domain/diagnostics.ts'
import { isPlainObject, normalizeNamedProxy } from './normalizer.ts'
import type { SubscriptionParseResult, SubscriptionParser } from './types.ts'

export class ClashYamlParser implements SubscriptionParser {
  readonly format = 'clash' as const

  canParse(content: string): boolean {
    try {
      const document: unknown = parse(content)
      return isPlainObject(document) && Array.isArray(document.proxies)
    } catch {
      return false
    }
  }

  parse(content: string): SubscriptionParseResult {
    const diagnostics: Diagnostic[] = []
    const proxies: SubscriptionParseResult['proxies'] = []
    let document: unknown
    try {
      document = parse(content)
    } catch (cause) {
      return {
        format: this.format,
        proxies,
        diagnostics: [{
          severity: 'error',
          code: 'CLASH_YAML_INVALID',
          message: cause instanceof Error ? cause.message : 'Invalid YAML document',
        }],
      }
    }

    if (!isPlainObject(document) || !Array.isArray(document.proxies)) {
      return {
        format: this.format,
        proxies,
        diagnostics: [{
          severity: 'error',
          code: 'CLASH_PROXIES_REQUIRED',
          message: 'Clash YAML must contain a proxies array',
          location: 'proxies',
        }],
      }
    }

    for (const [index, value] of document.proxies.entries()) {
      try {
        proxies.push(normalizeNamedProxy(value, `proxies[${index}]`))
      } catch (cause) {
        diagnostics.push({
          severity: 'error',
          code: 'CLASH_PROXY_INVALID',
          message: cause instanceof Error ? cause.message : 'Invalid Clash proxy',
          location: `proxies[${index}]`,
        })
      }
    }
    return { format: this.format, proxies, diagnostics }
  }
}
