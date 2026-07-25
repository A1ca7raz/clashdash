import type { JsonObject } from '../../../domain/json.ts'
import type { ParsedProxy } from '../types.ts'
import { decodeText, hostname, namedProxy, parseBoolean, parseUrl, proxyName, requiredPort, setIfPresent } from './helpers.ts'

export function parseTuicUri(input: string): ParsedProxy {
  const url = parseUrl(input)
  const uuid = decodeText(url.username, 'TUIC uuid')
  const password = decodeText(url.password, 'TUIC password')
  if (!uuid || !password) throw new Error('TUIC uuid and password are required')
  const fields: JsonObject = { server: hostname(url), port: requiredPort(url), uuid, password }
  setIfPresent(fields, 'sni', url.searchParams.get('sni'))
  setIfPresent(fields, 'congestion-controller', url.searchParams.get('congestion_control'))
  setIfPresent(fields, 'udp-relay-mode', url.searchParams.get('udp_relay_mode'))
  const insecure = url.searchParams.get('allow_insecure')
  if (insecure !== null) fields['skip-cert-verify'] = parseBoolean(insecure)
  const alpn = url.searchParams.get('alpn')
  if (alpn) fields.alpn = alpn.split(',').filter(Boolean)
  return namedProxy(proxyName(url, 'tuic'), 'tuic', fields)
}
