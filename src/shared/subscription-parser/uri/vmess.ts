import { isPlainObject } from '../normalizer.ts'
import type { ParsedProxy } from '../types.ts'
import { decodeBase64, namedProxy } from './helpers.ts'
import type { JsonObject } from '../../../domain/json.ts'

export function parseVmessUri(input: string): ParsedProxy {
  let value: unknown
  try {
    value = JSON.parse(decodeBase64(input.slice('vmess://'.length)))
  } catch (cause) {
    throw new Error(cause instanceof Error ? `Invalid VMess URI: ${cause.message}` : 'Invalid VMess URI')
  }
  if (!isPlainObject(value)) throw new Error('VMess payload must be an object')
  const server = stringField(value, 'add')
  const uuid = stringField(value, 'id')
  const port = Number(value.port)
  if (!server || !uuid || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('VMess server, port and id are required')
  }
  const proxy: JsonObject = {
    server,
    port,
    uuid,
    alterId: Number(value.aid ?? 0),
    cipher: stringField(value, 'scy') || 'auto',
  }
  const network = stringField(value, 'net')
  if (network) proxy.network = network
  const tls = stringField(value, 'tls')
  if (tls) proxy.tls = tls === 'tls'
  const servername = stringField(value, 'sni')
  if (servername) proxy.servername = servername
  const host = stringField(value, 'host')
  const path = stringField(value, 'path')
  if (network === 'ws' && (host || path)) {
    const wsOptions: JsonObject = {}
    if (path) wsOptions.path = path
    if (host) wsOptions.headers = { Host: host }
    proxy['ws-opts'] = wsOptions
  }
  return namedProxy(stringField(value, 'ps') || `vmess ${server}:${port}`, 'vmess', proxy)
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key]
  return typeof field === 'string' ? field : typeof field === 'number' ? String(field) : ''
}
