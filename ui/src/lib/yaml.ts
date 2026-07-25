import { parse } from 'yaml'

import type { JsonObject } from '../../../src/domain/json.ts'

export function parseYamlObject(value: string, label: string): JsonObject {
  const parsed = parse(value) as unknown
  if (parsed === null || parsed === undefined) return {}
  if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label} 必须是 YAML 对象`)
  return parsed as JsonObject
}
