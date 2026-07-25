import type { JsonValue } from '../json.ts'
import type { ImportProvider } from './provider.ts'

export type Proxy = {
  type: string
  [key: string]: JsonValue
}

export type ListenerTemplate = {
  type: string
  [key: string]: JsonValue
}

export type UserDefinedNode = {
  type: 'userdefined'
  id: string
  name: string
  tags: string[]
  proxy: Proxy
  listenerTemplate?: ListenerTemplate
}

export type ProviderNode = {
  type: 'provider'
  id: string
  name: string
  tags: string[]
  proxy: Proxy
  provider: ImportProvider
}

export type Node = UserDefinedNode | ProviderNode
