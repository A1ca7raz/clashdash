import type { Proxy } from '../models/node.ts'

export type NamedProxy = Proxy & {
  name: string
}
