import type { JsonObject } from '../../../domain/json.ts'
import type { ParsedProxy } from '../types.ts'
import { decodeText, hostname, namedProxy, parseBoolean, parseUrl, proxyName, requiredPort, setIfPresent } from './helpers.ts'

export function parseHysteria2Uri(input: string): ParsedProxy {
  const url = parseUrl(input.replace(/^hy2:/, 'hysteria2:'))
  const password = decodeText(url.password || url.username, 'Hysteria2 password')
  if (!password) throw new Error('Hysteria2 password is required')
  const fields: JsonObject = { server: hostname(url), port: requiredPort(url), password }
  setIfPresent(fields, 'sni', url.searchParams.get('sni'))
  setIfPresent(fields, 'obfs', url.searchParams.get('obfs'))
  setIfPresent(fields, 'obfs-password', url.searchParams.get('obfs-password'))
  const insecure = url.searchParams.get('insecure')
  if (insecure !== null) fields['skip-cert-verify'] = parseBoolean(insecure)
  const alpn = url.searchParams.get('alpn')
  if (alpn) fields.alpn = alpn.split(',').filter(Boolean)
  return namedProxy(proxyName(url, 'hysteria2'), 'hysteria2', fields)
}
