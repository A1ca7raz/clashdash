import type { JsonObject } from '../json.ts'
import type { ProviderHeaders } from '../models/provider.ts'

export function parseProviderHeaders(input: JsonObject): ProviderHeaders {
  const output: ProviderHeaders = {}
  const normalizedNames = new Set<string>()

  for (const [name, values] of Object.entries(input)) {
    const normalizedName = name.toLowerCase()
    if (normalizedName === 'user-agent') {
      throw new Error('Header YAML 中的 User-Agent 请使用独立的 User-Agent 字段配置')
    }
    if (normalizedNames.has(normalizedName)) {
      throw new Error(`Header YAML 包含重复的请求头: ${name}`)
    }
    if (!isNonEmptyStringArray(values)) {
      throw new Error(`Header YAML 字段 "${name}" 必须是非空字符串数组`)
    }

    try {
      const headers = new Headers()
      for (const value of values) headers.append(name, value)
    } catch {
      throw new Error(`Header YAML 包含无效的请求头名称或值: ${name}`)
    }

    normalizedNames.add(normalizedName)
    output[name] = [...values]
  }

  return output
}

export function renderProviderHeaders(headers: ProviderHeaders): JsonObject {
  return structuredClone(headers)
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0
    && value.every((item) => typeof item === 'string')
}
