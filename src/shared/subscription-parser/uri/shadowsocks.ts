import type { JsonObject } from '../../../domain/json.ts'
import type { ParsedProxy } from '../types.ts'
import { decodeBase64, decodeText, hostname, namedProxy, parseUrl, proxyName, requiredPort } from './helpers.ts'

export function parseShadowsocksUri(input: string): ParsedProxy {
  let uri = input
  const rawBody = input.slice('ss://'.length).split('#', 1)[0] ?? ''
  if (!rawBody.includes('@')) {
    const suffixIndex = input.search(/[?#]/)
    const suffix = suffixIndex >= 0 ? input.slice(suffixIndex) : ''
    const encoded = suffixIndex >= 0 ? input.slice('ss://'.length, suffixIndex) : input.slice('ss://'.length)
    uri = `ss://${decodeBase64(encoded)}${suffix}`
  }
  const url = parseUrl(uri)
  let credentials = decodeText(url.username, 'Shadowsocks credentials')
  if (url.password.length > 0) credentials += `:${decodeText(url.password, 'Shadowsocks password')}`
  if (!credentials.includes(':')) credentials = decodeBase64(credentials)
  const separator = credentials.indexOf(':')
  if (separator <= 0) throw new Error('Shadowsocks cipher and password are required')

  const fields: JsonObject = {
    server: hostname(url),
    port: requiredPort(url),
    cipher: credentials.slice(0, separator),
    password: credentials.slice(separator + 1),
  }
  const plugin = url.searchParams.get('plugin')
  if (plugin) {
    const [name, ...options] = decodeText(plugin, 'plugin').split(';')
    if (name) fields.plugin = name
    if (options.length > 0) fields['plugin-opts'] = Object.fromEntries(options.map((item) => {
      const [key, ...rest] = item.split('=')
      return [key, rest.length > 0 ? rest.join('=') : true]
    }))
  }
  return namedProxy(proxyName(url, 'ss'), 'ss', fields)
}
