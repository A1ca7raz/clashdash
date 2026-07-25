import type { Diagnostic } from '../diagnostics.ts'
import type { JsonObject, JsonValue } from '../json.ts'

const behaviors = new Set(['domain', 'ipcidr', 'classical'])
const formats = new Set(['yaml', 'text', 'mrs'])
const httpOnlyFields = [
  'url', 'path', 'interval', 'proxy', 'format', 'path-in-bundle', 'size-limit', 'header',
] as const

export function validateRuleProviderConfig(config: JsonObject): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const type = config.type
  const behavior = config.behavior

  if (type !== 'http' && type !== 'inline') {
    diagnostics.push(error('RULE_PROVIDER_TYPE_INVALID', 'Rule Provider type must be http or inline', 'config.type'))
  }
  if (typeof behavior !== 'string' || !behaviors.has(behavior)) {
    diagnostics.push(error(
      'RULE_PROVIDER_BEHAVIOR_INVALID',
      'Rule Provider behavior must be domain, ipcidr or classical',
      'config.behavior',
    ))
  }

  if (type === 'http') validateHttp(config, diagnostics)
  if (type === 'inline') validateInline(config, diagnostics)
  return diagnostics
}

function validateHttp(config: JsonObject, diagnostics: Diagnostic[]): void {
  requireNonEmptyString(config.url, 'url', diagnostics)
  optionalNonEmptyString(config.path, 'path', diagnostics)
  optionalNonEmptyString(config.proxy, 'proxy', diagnostics)
  optionalNonEmptyString(config['path-in-bundle'], 'path-in-bundle', diagnostics)
  optionalPositiveInteger(config.interval, 'interval', diagnostics)
  optionalPositiveInteger(config['size-limit'], 'size-limit', diagnostics)

  if (config.payload !== undefined) {
    diagnostics.push(error(
      'RULE_PROVIDER_FIELD_NOT_ALLOWED',
      'Rule Provider payload is only supported by inline providers',
      'config.payload',
    ))
  }
  if (config.format !== undefined && (typeof config.format !== 'string' || !formats.has(config.format))) {
    diagnostics.push(error(
      'RULE_PROVIDER_FORMAT_INVALID',
      'Rule Provider format must be yaml, text or mrs',
      'config.format',
    ))
  }
  if (config.format === 'mrs' && config.behavior === 'classical') {
    diagnostics.push(error(
      'RULE_PROVIDER_MRS_BEHAVIOR_INVALID',
      'MRS format does not support classical behavior',
      'config.format',
    ))
  }
  if (config.header !== undefined && !isHeader(config.header)) {
    diagnostics.push(error(
      'RULE_PROVIDER_HEADER_INVALID',
      'Rule Provider header must map names to strings or string arrays',
      'config.header',
    ))
  }
}

function validateInline(config: JsonObject, diagnostics: Diagnostic[]): void {
  if (!Array.isArray(config.payload) || config.payload.length === 0 || !config.payload.every(isNonEmptyString)) {
    diagnostics.push(error(
      'RULE_PROVIDER_PAYLOAD_INVALID',
      'Inline Rule Provider payload must be a non-empty string array',
      'config.payload',
    ))
  }
  for (const field of httpOnlyFields) {
    if (config[field] !== undefined) {
      diagnostics.push(error(
        'RULE_PROVIDER_FIELD_NOT_ALLOWED',
        `Rule Provider ${field} is only supported by http providers`,
        `config.${field}`,
      ))
    }
  }
}

function requireNonEmptyString(value: JsonValue | undefined, field: string, diagnostics: Diagnostic[]): void {
  if (!isNonEmptyString(value)) {
    diagnostics.push(error(
      'RULE_PROVIDER_FIELD_INVALID',
      `Rule Provider ${field} must be a non-empty string`,
      `config.${field}`,
    ))
  }
}

function optionalNonEmptyString(value: JsonValue | undefined, field: string, diagnostics: Diagnostic[]): void {
  if (value !== undefined && !isNonEmptyString(value)) requireNonEmptyString(value, field, diagnostics)
}

function optionalPositiveInteger(value: JsonValue | undefined, field: string, diagnostics: Diagnostic[]): void {
  if (value !== undefined && (typeof value !== 'number' || !Number.isInteger(value) || value <= 0)) {
    diagnostics.push(error(
      'RULE_PROVIDER_FIELD_INVALID',
      `Rule Provider ${field} must be a positive integer`,
      `config.${field}`,
    ))
  }
}

function isNonEmptyString(value: JsonValue | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isHeader(value: JsonValue): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.values(value).every((item) => typeof item === 'string'
      || (Array.isArray(item) && item.every((part) => typeof part === 'string')))
}

function error(code: string, message: string, location: string): Diagnostic {
  return { severity: 'error', code, message, location }
}
