import type { JsonObject } from '../../../domain/json.ts'
import type { ParsedProxy } from '../types.ts'
import { decodeBase64, namedProxy } from './helpers.ts'

export function parseShadowsocksrUri(input: string): ParsedProxy {
  const decoded = decodeBase64(input.slice('ssr://'.length))
  const [main = '', query = ''] = decoded.split('/?', 2)
  const segments = splitSsrMain(main)
  if (segments.length !== 6) throw new Error('Invalid ShadowsocksR URI')
  const [server = '', portText = '', protocol = '', cipher = '', obfs = '', passwordText = ''] = segments
  const port = Number(portText)
  if (!server || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Invalid ShadowsocksR server or port')
  }
  const parameters = new URLSearchParams(query)
  const decodeParameter = (key: string): string | undefined => {
    const value = parameters.get(key)
    return value ? decodeBase64(value) : undefined
  }
  const remarks = decodeParameter('remarks')?.trim()
  const fields: JsonObject = {
    server: stripIpv6Brackets(server),
    port,
    protocol,
    cipher,
    obfs,
    password: decodeBase64(passwordText),
  }
  const protocolParam = decodeParameter('protoparam')
  const obfsParam = decodeParameter('obfsparam')
  if (protocolParam) fields['protocol-param'] = protocolParam
  if (obfsParam) fields['obfs-param'] = obfsParam
  return namedProxy(remarks || `ssr ${stripIpv6Brackets(server)}:${port}`, 'ssr', fields)
}

function splitSsrMain(value: string): string[] {
  if (!value.startsWith('[')) return value.split(':')
  const end = value.indexOf(']')
  if (end < 0) return []
  return [value.slice(0, end + 1), ...value.slice(end + 1).replace(/^:/, '').split(':')]
}

function stripIpv6Brackets(value: string): string {
  return value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value
}
