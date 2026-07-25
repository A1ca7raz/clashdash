import type { JsonObject } from '../../../domain/json.ts'
import type { ParsedProxy } from '../types.ts'
import { hostname, namedProxy, parseBoolean, parseUrl, proxyName, requiredPort, setIfPresent } from './helpers.ts'

export function parseVlessUri(input: string): ParsedProxy {
  const url = parseUrl(input)
  const uuid = decodeURIComponent(url.username)
  if (!uuid) throw new Error('VLESS uuid is required')
  const fields: JsonObject = { server: hostname(url), port: requiredPort(url), uuid, udp: true }
  const network = url.searchParams.get('type')
  setIfPresent(fields, 'network', network)
  const security = url.searchParams.get('security')
  if (security && security !== 'none') fields.tls = true
  setIfPresent(fields, 'servername', url.searchParams.get('sni'))
  setIfPresent(fields, 'flow', url.searchParams.get('flow'))
  setIfPresent(fields, 'client-fingerprint', url.searchParams.get('fp'))
  const insecure = url.searchParams.get('allowInsecure')
  if (insecure !== null) fields['skip-cert-verify'] = parseBoolean(insecure)
  const path = url.searchParams.get('path')
  const host = url.searchParams.get('host')
  if (network === 'ws' && (path || host)) {
    const options: JsonObject = {}
    if (path) options.path = path
    if (host) options.headers = { Host: host }
    fields['ws-opts'] = options
  }
  return namedProxy(proxyName(url, 'vless'), 'vless', fields)
}
