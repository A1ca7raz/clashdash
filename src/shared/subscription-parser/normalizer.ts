import { isJsonValue, type JsonObject } from '../../domain/json.ts'
import type { ParsedProxy } from './types.ts'

export function normalizeNamedProxy(value: unknown, location: string): ParsedProxy {
  if (!isPlainObject(value)) throw new Error(`${location} must be an object`)
  const { name, type, ...fields } = value
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error(`${location}.name must be a non-empty string`)
  }
  if (typeof type !== 'string' || type.trim().length === 0) {
    throw new Error(`${location}.type must be a non-empty string`)
  }
  if (!isJsonValue(fields)) throw new Error(`${location} contains a non-JSON value`)

  return {
    name: name.trim(),
    proxy: { type, ...(fields as JsonObject) },
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
