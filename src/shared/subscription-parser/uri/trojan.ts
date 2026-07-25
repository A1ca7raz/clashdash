import type { JsonObject } from '../../../domain/json.ts'
import type { ParsedProxy } from '../types.ts'
import { decodeText, hostname, namedProxy, parseBoolean, parseUrl, proxyName, requiredPort, setIfPresent } from './helpers.ts'

export function parseTrojanUri(input: string): ParsedProxy {
  const url = parseUrl(input)
  const password = decodeText(url.username, 'Trojan password')
  if (!password) throw new Error('Trojan password is required')
  const fields: JsonObject = { server: hostname(url), port: requiredPort(url), password }
  setIfPresent(fields, 'sni', url.searchParams.get('sni') ?? url.searchParams.get('peer'))
  setIfPresent(fields, 'network', url.searchParams.get('type'))
  const insecure = url.searchParams.get('allowInsecure')
  if (insecure !== null) fields['skip-cert-verify'] = parseBoolean(insecure)
  return namedProxy(proxyName(url, 'trojan'), 'trojan', fields)
}
