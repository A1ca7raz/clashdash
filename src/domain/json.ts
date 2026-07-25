export type JsonPrimitive = null | boolean | number | string

export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject

export interface JsonObject {
  [key: string]: JsonValue
}

export function isJsonValue(value: unknown, ancestors = new WeakSet<object>()): value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true
  }

  if (typeof value !== 'object') {
    return false
  }

  if (ancestors.has(value)) {
    return false
  }

  ancestors.add(value)
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, ancestors))
    : isPlainObject(value) && Object.values(value).every((item) => isJsonValue(item, ancestors))
  ancestors.delete(value)
  return valid
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value) as object | null
  return prototype === Object.prototype || prototype === null
}
