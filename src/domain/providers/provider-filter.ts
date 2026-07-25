import { compilePatternList } from './mihomo-pattern.ts'
import type { NamedProxy } from './types.ts'

export type ProviderFilterOptions = {
  filter?: string
  excludeFilter?: string
  excludeType?: string
}

export function filterProviderProxies<T extends NamedProxy>(
  proxies: readonly T[],
  options: ProviderFilterOptions,
): T[] {
  let includes
  let excludes

  try {
    includes = compilePatternList(options.filter)
    excludes = compilePatternList(options.excludeFilter)
  } catch (cause) {
    throw new Error('Invalid provider filter configuration', { cause })
  }

  const excludedTypes = new Set(
    (options.excludeType ?? '')
      .split('|')
      .map((type) => type.trim().toLowerCase())
      .filter(Boolean),
  )
  const names = new Set<string>()
  const result: T[] = []

  for (const proxy of proxies) {
    if (excludedTypes.has(proxy.type.toLowerCase())) {
      continue
    }
    if (excludes.some((pattern) => pattern.test(proxy.name))) {
      continue
    }
    if (includes.length > 0 && !includes.some((pattern) => pattern.test(proxy.name))) {
      continue
    }
    if (names.has(proxy.name)) {
      continue
    }
    names.add(proxy.name)
    result.push(proxy)
  }

  return result
}
