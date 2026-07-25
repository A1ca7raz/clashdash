import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { stringify } from 'yaml'

import type { ProxyProvider } from '../../../../src/domain/models/provider.ts'
import { parseProviderOverride, renderProviderOverride } from '../../../../src/domain/providers/provider-transform.ts'
import { parseSubscription } from '../../../../src/shared/subscription-parser/index.ts'
import { api, post, put, remove } from '../../api/client.ts'
import { Badge, Button, Dialog, Empty, ErrorNotice, Field, YamlEditor } from '../../components/ui.tsx'
import { PageHeader } from '../../components/Layout.tsx'
import { parseYamlObject } from '../../lib/yaml.ts'

type UserDefinedNodeItem = {
  type: 'userdefined'; id: string; name: string; tags: string[]
  proxy: Record<string, unknown>; listenerTemplate?: Record<string, unknown>
}
type ProviderNodeItem = {
  type: 'provider'; id: string; name: string; tags: string[]
  proxy: Record<string, unknown>; provider: { id: string; name: string }
}
type NodeItem = UserDefinedNodeItem | ProviderNodeItem
export function NodesPage() {
  const client = useQueryClient()
  const nodes = useQuery({ queryKey: ['nodes'], queryFn: () => api<NodeItem[]>('/api/nodes') })
  const providers = useQuery({ queryKey: ['providers'], queryFn: () => api<ProxyProvider[]>('/api/providers') })
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('all')
  const [dialog, setDialog] = useState<'node' | 'import' | 'provider' | null>(null)
  const [editingNode, setEditingNode] = useState<UserDefinedNodeItem>()
  const [editingProvider, setEditingProvider] = useState<ProxyProvider>()
  const filtered = useMemo(() => (nodes.data ?? []).filter((node) => {
    const matchesText = `${node.name} ${node.tags.join(' ')} ${String(node.proxy.type ?? '')}`.toLowerCase().includes(query.toLowerCase())
    const matchesSource = source === 'all' || source === node.type
      || (node.type === 'provider' && node.provider.id === source)
    return matchesText && matchesSource
  }), [nodes.data, query, source])
  const refresh = useMutation({
    mutationFn: (id: string) => post(`/api/providers/${id}/refresh`),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['nodes'] }) },
  })
  const deleteNode = useMutation({
    mutationFn: (id: string) => remove(`/api/nodes/${id}`),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['nodes'] }) },
  })
  const deleteProvider = useMutation({
    mutationFn: (id: string) => remove(`/api/providers/${id}`),
    onSuccess: () => { void Promise.all([client.invalidateQueries({ queryKey: ['nodes'] }), client.invalidateQueries({ queryKey: ['providers'] })]) },
  })

  return <>
    <PageHeader title="节点与来源" detail="维护可编辑节点，并从远程 Provider 稳定刷新只读节点。" actions={<>
      <Button variant="quiet" onClick={() => setDialog('import')}>批量导入</Button>
      <Button variant="quiet" onClick={() => setDialog('provider')}>＋ Provider</Button>
      <Button onClick={() => setDialog('node')}>＋ 新建节点</Button>
    </>} />
    <section className="toolbar">
      <input className="search" placeholder="搜索名称、Tag 或协议…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <select value={source} onChange={(event) => setSource(event.target.value)}>
        <option value="all">全部来源</option><option value="userdefined">自定义节点</option><option value="provider">Provider 节点</option>
        {providers.data?.map((provider) => <option value={provider.id} key={provider.id}>{provider.name}</option>)}
      </select>
    </section>
    <ErrorNotice error={nodes.error ?? providers.error ?? refresh.error ?? deleteNode.error ?? deleteProvider.error} />
    {filtered.length === 0 && !nodes.isLoading ? <Empty title="没有匹配的节点" detail="创建结构化节点，或从 Clash / URI / Base64 订阅批量导入。" /> :
      <div className="data-grid">{filtered.map((node) => <article
        className={`node-card ${node.type === 'userdefined' ? 'node-card-editable' : ''}`}
        key={node.id}
        role={node.type === 'userdefined' ? 'button' : undefined}
        tabIndex={node.type === 'userdefined' ? 0 : undefined}
        aria-label={node.type === 'userdefined' ? `编辑节点 ${node.name}` : undefined}
        onClick={() => { if (node.type === 'userdefined') setEditingNode(node) }}
        onKeyDown={(event) => {
          if (node.type === 'userdefined' && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault()
            setEditingNode(node)
          }
        }}
      >
        <header className="node-card-head">
          <div className="node-identity"><h3>{node.name}</h3><span>{String(node.proxy.type ?? 'unknown').toUpperCase()}</span></div>
          {node.type === 'provider' ? <Badge tone='lime'>订阅</Badge> : ''}
        </header>
        <div className="node-endpoint"><code>{String(node.proxy.server ?? '—')}:{String(node.proxy.port ?? '—')}</code></div>
        <footer className="node-card-foot"><div className="node-tags">{node.tags.length > 0 ? node.tags.map((tag) => <span key={tag}>#{tag}</span>) : <span>无标签</span>}</div>
          <div className="card-actions">{node.type === 'userdefined' ? <button onClick={(event) => { event.stopPropagation(); if (confirm(`删除 ${node.name}？Profile 中的引用将被自动移除。`)) deleteNode.mutate(node.id) }}>删除</button> : <span>只读</span>}</div>
        </footer>
      </article>)}</div>}
    <section className="provider-section"><div className="section-title"><h2>Provider</h2></div>
      <div className="provider-list">{providers.data?.map((provider) => <article key={provider.id}>
        <div><Badge tone={provider.type === 'import' ? 'cyan' : 'neutral'}>{provider.type.toUpperCase()}</Badge><h3>{provider.name}</h3><p>{provider.url}</p></div>
        <div className="provider-meta"><span>每 {provider.interval}s</span>{provider.filter && <span>Filter: {provider.filter}</span>}</div>
        <div className="row-actions"><Button variant="quiet" onClick={() => setEditingProvider(provider)}>编辑订阅</Button>{provider.type === 'import' && <Button variant="quiet" disabled={refresh.isPending} onClick={() => refresh.mutate(provider.id)}>刷新</Button>}<Button variant="danger" onClick={() => { if (confirm(`删除 Provider ${provider.name}？`)) deleteProvider.mutate(provider.id) }}>删除</Button></div>
      </article>)}</div>
    </section>
    {dialog === 'node' && <NodeDialog onClose={() => setDialog(null)} onDone={() => { setDialog(null); void client.invalidateQueries({ queryKey: ['nodes'] }) }} />}
    {editingNode && <NodeDialog value={editingNode} onClose={() => setEditingNode(undefined)} onDone={() => { setEditingNode(undefined); void client.invalidateQueries({ queryKey: ['nodes'] }) }} />}
    {dialog === 'import' && <ImportDialog onClose={() => setDialog(null)} onDone={() => { setDialog(null); void client.invalidateQueries({ queryKey: ['nodes'] }) }} />}
    {dialog === 'provider' && <ProviderDialog onClose={() => setDialog(null)} onDone={() => { setDialog(null); void client.invalidateQueries({ queryKey: ['providers'] }) }} />}
    {editingProvider && <ProviderDialog value={editingProvider} onClose={() => setEditingProvider(undefined)} onDone={() => { setEditingProvider(undefined); void Promise.all([client.invalidateQueries({ queryKey: ['providers'] }), client.invalidateQueries({ queryKey: ['nodes'] })]) }} />}
  </>
}

function NodeDialog({ value, onClose, onDone }: { value?: UserDefinedNodeItem; onClose(): void; onDone(): void }) {
  const [name, setName] = useState(value?.name ?? '')
  const [tags, setTags] = useState(value?.tags.join(', ') ?? '')
  const [proxy, setProxy] = useState(() => stringify(value?.proxy ?? {
    type: 'ss', server: 'example.com', port: 443, cipher: 'aes-128-gcm', password: '',
  }, { lineWidth: 0 }))
  const [listener, setListener] = useState(() => value?.listenerTemplate
    ? stringify(value.listenerTemplate, { lineWidth: 0 })
    : '')
  const mutation = useMutation({ mutationFn: async () => {
    const proxyValue = parseYamlObject(proxy, 'Proxy')
    const listenerTemplate = listener.trim() ? parseYamlObject(listener, 'ListenerTemplate') : undefined
    const body = {
      type: 'userdefined', name, tags: splitTags(tags), proxy: proxyValue,
      ...(listenerTemplate ? { listenerTemplate } : {}),
    }
    return value ? put(`/api/nodes/${value.id}`, body) : post('/api/nodes', body)
  }, onSuccess: onDone })
  return <Dialog title={value ? '编辑 UserDefined Node' : '新建 UserDefined Node'} onClose={onClose}><form onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
    <ErrorNotice error={mutation.error} /><div className="form-grid"><Field label="节点名称"><input required value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Tags"><input placeholder="Tags，以逗号分隔" value={tags} onChange={(e) => setTags(e.target.value)} /></Field></div>
    <Field label="Proxy YAML" hint="name 不放在 Proxy 内"><YamlEditor value={proxy} onChange={setProxy} rows={11} /></Field>
    <Field label="ListenerTemplate YAML（可选）"><YamlEditor value={listener} onChange={setListener} rows={5} /></Field>
    <div className="dialog-actions"><Button type="button" variant="quiet" onClick={onClose}>取消</Button><Button disabled={mutation.isPending}>{value ? '保存修改' : '保存节点'}</Button></div>
  </form></Dialog>
}

function ImportDialog({ onClose, onDone }: { onClose(): void; onDone(): void }) {
  const [format, setFormat] = useState<'clash' | 'uri' | 'base64'>('clash')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const mutation = useMutation({ mutationFn: () => {
    const parsed = parseSubscription(content, format)
    const errors = parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
    if (errors.length > 0) {
      throw new Error(errors.map((diagnostic) =>
        `${diagnostic.location ? `${diagnostic.location}: ` : ''}${diagnostic.message}`,
      ).join('; '))
    }
    return post('/api/nodes/import', { format, content, tags: splitTags(tags) })
  }, onSuccess: onDone })
  return <Dialog title="批量导入节点" onClose={onClose}><form onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
    <ErrorNotice error={mutation.error} /><div className="form-grid"><Field label="输入格式"><select value={format} onChange={(e) => setFormat(e.target.value as typeof format)}><option value="clash">Clash YAML</option><option value="uri">URI 列表</option><option value="base64">Base64 URI 列表</option></select></Field><Field label="统一 Tags"><input value={tags} onChange={(e) => setTags(e.target.value)} /></Field></div>
    <Field label="订阅内容"><textarea className="code-editor" rows={14} required value={content} onChange={(e) => setContent(e.target.value)} /></Field>
    <div className="dialog-actions"><Button type="button" variant="quiet" onClick={onClose}>取消</Button><Button disabled={mutation.isPending}>解析并导入</Button></div>
  </form></Dialog>
}

function ProviderDialog({ value, onClose, onDone }: { value?: ProxyProvider; onClose(): void; onDone(): void }) {
  const [type, setType] = useState<'import' | 'passthrough'>(value?.type ?? 'import')
  const [name, setName] = useState(value?.name ?? '')
  const [url, setUrl] = useState(value?.url ?? '')
  const [interval, setIntervalValue] = useState(value?.interval ?? 3600)
  const [format, setFormat] = useState<'clash' | 'uri' | 'base64'>(value?.type === 'import' ? value.subscriptionFormat : 'clash')
  const [filter, setFilter] = useState(value?.filter ?? '')
  const [excludeFilter, setExcludeFilter] = useState(value?.excludeFilter ?? '')
  const [excludeType, setExcludeType] = useState(value?.excludeType ?? '')
  const [override, setOverride] = useState(() => stringify(renderProviderOverride(value?.override ?? {}), { lineWidth: 0 }))
  const [config, setConfig] = useState(() => stringify(value?.type === 'passthrough' ? value.config : {}, { lineWidth: 0 }))
  const mutation = useMutation({ mutationFn: () => {
    const body = {
    type, name, url, interval,
    ...(filter ? { filter } : {}), ...(excludeFilter ? { excludeFilter } : {}), ...(excludeType ? { excludeType } : {}),
    override: parseProviderOverride(parseYamlObject(override, 'Override')),
    ...(type === 'import' ? { subscriptionFormat: format } : { config: parseYamlObject(config, 'Provider config') }),
    }
    return value ? put(`/api/providers/${value.id}`, body) : post('/api/providers', body)
  }, onSuccess: onDone })
  return <Dialog title={value ? '编辑订阅' : '新建 Provider'} onClose={onClose}><form onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
    <ErrorNotice error={mutation.error} /><div className="form-grid three"><Field label="模式"><select value={type} onChange={(e) => setType(e.target.value as typeof type)}><option value="import">Import · 拉取并解析</option><option value="passthrough">Passthrough · 客户端拉取</option></select></Field><Field label="名称"><input required value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="刷新间隔（秒）"><input type="number" min={1} value={interval} onChange={(e) => setIntervalValue(Number(e.target.value))} /></Field></div>
    <Field label="URL"><input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
    {type === 'import' && <Field label="订阅格式"><select value={format} onChange={(e) => setFormat(e.target.value as typeof format)}><option value="clash">Clash</option><option value="uri">URI</option><option value="base64">Base64</option></select></Field>}
    <div className="form-grid three"><Field label="Filter"><input value={filter} onChange={(e) => setFilter(e.target.value)} /></Field><Field label="Exclude Filter"><input value={excludeFilter} onChange={(e) => setExcludeFilter(e.target.value)} /></Field><Field label="Exclude Type"><input value={excludeType} onChange={(e) => setExcludeType(e.target.value)} placeholder="ss|http" /></Field></div>
    <Field label="Override YAML（Mihomo 字段）"><YamlEditor value={override} onChange={setOverride} rows={7} /></Field>
    {type === 'passthrough' && <Field label="额外 Provider config YAML"><YamlEditor value={config} onChange={setConfig} rows={5} /></Field>}
    <div className="dialog-actions"><Button type="button" variant="quiet" onClick={onClose}>取消</Button><Button disabled={mutation.isPending}>{value ? '保存修改' : '保存 Provider'}</Button></div>
  </form></Dialog>
}

function splitTags(value: string): string[] { return value.split(',').map((item) => item.trim()).filter(Boolean) }
