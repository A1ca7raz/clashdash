import type { JsonValue } from '../json.ts'
import type { UserDefinedNode } from './node.ts'

export type Listener = {
  name: string
  type: string
  [key: string]: JsonValue
}

export type ListenerEntry =
  | {
      type: 'userdefined'
      listener: Listener
    }
  | {
      type: 'derived'
      name: string
      node: UserDefinedNode
    }
