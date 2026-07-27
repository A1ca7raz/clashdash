import { parse, stringify } from 'yaml'

import type { JsonObject } from '../../../src/domain/json.ts'

export function parseYamlObject(value: string, label: string): JsonObject {
  const parsed = parse(value) as unknown
  if (parsed === null || parsed === undefined) return {}
  if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label} 必须是 YAML 对象`)
  return parsed as JsonObject
}

export function parseOptionalYamlObject(value: string, label: string): JsonObject | undefined {
  const parsed = parseYamlObject(value, label)
  return Object.keys(parsed).length > 0 ? parsed : undefined
}

export function stringifyYamlObject(value: JsonObject | undefined): string {
  return value && Object.keys(value).length > 0
    ? stringify(value, { lineWidth: 0 })
    : ''
}
