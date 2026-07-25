import type { JsonObject, JsonValue } from '../../../domain/json.ts'
import type { ParsedProxy } from '../types.ts'

export function decodeBase64(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) throw new Error('Invalid Base64 data')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  let binary: string
  try {
    binary = atob(padded)
  } catch {
    throw new Error('Invalid Base64 data')
  }
  if (binary.length === 0 && normalized.length > 0) throw new Error('Invalid Base64 data')
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function decodeText(value: string, label: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    throw new Error(`Invalid URL encoding in ${label}`)
  }
}

export function requiredPort(url: URL): number {
  const port = Number(url.port)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('Port is required')
  return port
}

export function hostname(url: URL): string {
  const host = url.hostname
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
}

export function proxyName(url: URL, protocol: string): string {
  const fragment = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
  const decoded = fragment.length > 0 ? decodeText(fragment, 'proxy name').trim() : ''
  return decoded || `${protocol} ${hostname(url)}:${url.port}`
}

export function namedProxy(name: string, type: string, fields: JsonObject): ParsedProxy {
  return { name, proxy: { type, ...fields } }
}

export function setIfPresent(
  target: JsonObject,
  key: string,
  value: string | null,
  transform: (value: string) => JsonValue = (item) => item,
): void {
  if (value !== null && value.length > 0) target[key] = transform(value)
}

export function parseBoolean(value: string): boolean {
  return value === '1' || value.toLowerCase() === 'true'
}

export function parseUrl(value: string): URL {
  try {
    return new URL(value)
  } catch {
    throw new Error('Invalid proxy URI')
  }
}
