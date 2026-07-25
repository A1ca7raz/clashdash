import { randomUUID } from 'node:crypto'

import { NotFoundError, ValidationError } from '../errors.ts'
import type { AppStore } from '../ports/app-store.ts'
import type { SubscriptionParserPort } from '../ports/subscription-parser.ts'
import type { ListenerTemplate, Proxy, UserDefinedNode } from '../../domain/models/node.ts'
import type { ImportProvider } from '../../domain/models/provider.ts'

export type CreateNodeInput = {
  name: string
  tags?: string[]
  proxy: Proxy
  listenerTemplate?: ListenerTemplate
}

export class NodeService {
  constructor(
    private readonly store: AppStore,
    private readonly parsers: SubscriptionParserPort,
    private readonly createId: () => string = randomUUID,
  ) {}

  async list() { return this.store.listNodes() }

  async create(input: CreateNodeInput): Promise<UserDefinedNode> {
    validateNodeInput(input)
    const node: UserDefinedNode = {
      type: 'userdefined', id: this.createId(), name: input.name.trim(), tags: [...(input.tags ?? [])],
      proxy: structuredClone(input.proxy),
      ...(input.listenerTemplate === undefined ? {} : { listenerTemplate: structuredClone(input.listenerTemplate) }),
    }
    await this.store.saveUserDefinedNode(node)
    return node
  }

  async import(content: string, format: ImportProvider['subscriptionFormat'], tags: string[] = []): Promise<UserDefinedNode[]> {
    const result = this.parsers.parse(content, format)
    const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
    if (errors.length > 0) throw new ValidationError(errors.map((item) => item.message).join('; '))
    const nodes = result.proxies.map((item): UserDefinedNode => ({
      type: 'userdefined', id: this.createId(), name: item.name, tags: [...tags], proxy: structuredClone(item.proxy),
    }))
    for (const node of nodes) await this.store.saveUserDefinedNode(node)
    return nodes
  }

  async update(node: UserDefinedNode): Promise<UserDefinedNode> {
    const existing = await this.store.getNode(node.id)
    if (existing?.type !== 'userdefined') throw new NotFoundError(`UserDefined Node not found: ${node.id}`)
    validateNodeInput(node)
    await this.store.saveUserDefinedNode(structuredClone(node))
    return node
  }

  async delete(id: string): Promise<void> {
    if (!await this.store.deleteUserDefinedNode(id)) throw new NotFoundError(`UserDefined Node not found: ${id}`)
  }
}

function validateNodeInput(input: CreateNodeInput): void {
  if (!input.name.trim()) throw new ValidationError('Node name is required')
  if (!input.proxy.type?.trim()) throw new ValidationError('Proxy type is required')
  if ('name' in input.proxy) throw new ValidationError('proxy.name is reserved; use Node.name')
  if (input.listenerTemplate && !input.listenerTemplate.type?.trim()) {
    throw new ValidationError('Listener template type is required')
  }
}
