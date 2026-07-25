import type { Diagnostic } from '../diagnostics.ts'
import type { ProxyProvider } from '../models/provider.ts'
import { validateOverrideExpression } from './override-expression/evaluator.ts'
import { compilePatternList, MihomoPattern } from './mihomo-pattern.ts'

export function validateProvider(provider: ProxyProvider): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  if (!provider.name.trim()) diagnostics.push(error('PROVIDER_NAME_REQUIRED', 'Provider name is required'))
  if (!Number.isInteger(provider.interval) || provider.interval <= 0) {
    diagnostics.push(error('PROVIDER_INTERVAL_INVALID', 'Provider interval must be a positive integer'))
  }
  try {
    const url = new URL(provider.url)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
  } catch {
    diagnostics.push(error('PROVIDER_URL_INVALID', 'Provider URL must be HTTP or HTTPS'))
  }
  for (const [field, value] of [
    ['filter', provider.filter], ['excludeFilter', provider.excludeFilter],
  ] as const) {
    try { compilePatternList(value) }
    catch (cause) {
      diagnostics.push(error('PROVIDER_PATTERN_INVALID', `${field}: ${errorMessage(cause)}`))
    }
  }
  for (const [index, replacement] of (provider.override?.proxyName ?? []).entries()) {
    try { void new MihomoPattern(replacement.pattern) }
    catch (cause) {
      diagnostics.push(error('PROVIDER_PROXY_NAME_PATTERN_INVALID', `proxyName[${index}]: ${errorMessage(cause)}`))
    }
  }
  for (const [index, expression] of (provider.override?.overrideExpr ?? []).entries()) {
    try { validateOverrideExpression(expression) }
    catch (cause) {
      diagnostics.push(error('PROVIDER_OVERRIDE_EXPR_INVALID', `overrideExpr[${index}]: ${errorMessage(cause)}`))
    }
  }
  return diagnostics
}

function error(code: string, message: string): Diagnostic {
  return { severity: 'error', code, message }
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Invalid value'
}
