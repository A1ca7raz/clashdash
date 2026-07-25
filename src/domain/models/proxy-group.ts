import type { JsonValue } from '../json.ts'

export type ProxyGroup = {
  name: string
  type: string
  proxies?: string[]
  use?: string[]
  [key: string]: JsonValue | undefined
}
