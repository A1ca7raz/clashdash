import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { stringify } from 'yaml'

import type { Listener, ListenerEntry } from '../../../../src/domain/models/listener.ts'
import type { Node, UserDefinedNode } from '../../../../src/domain/models/node.ts'
import type { Profile, ResolvedProfile } from '../../../../src/domain/models/profile.ts'
import type { ProxyProvider, PassthroughProvider } from '../../../../src/domain/models/provider.ts'
import type { ProxyGroup } from '../../../../src/domain/models/proxy-group.ts'
import type { RuleProvider } from '../../../../src/domain/models/rule-provider.ts'
import type { RulePack } from '../../../../src/domain/models/rule.ts'
import { api, post, put, remove } from '../../api/client.ts'
import { Badge, Button, Dialog, Empty, ErrorNotice, Field } from '../../components/ui.tsx'
import { parseYamlObject } from '../../lib/yaml.ts'
import { createRuleEditorItem, RuleListEditor, type RuleEditorItem } from '../rules/RuleListEditor.tsx'

type Diagnostic = { severity: 'error' | 'warning'; code: string; message: string; location?: string }
type Preview = { yaml: string; diagnostics: Diagnostic[] }
type SubscriptionToken = { id: string; note?: string; token: string; subscriptionUrl: string }

export function ProfileEditor({ value, onChanged, onDeleted }: {
  value: ResolvedProfile
  onChanged(): void
  onDeleted(): void
}) {
  const client = useQueryClient()
  const [name, setName] = useState(value.profile.name)
  const [tags, setTags] = useState(value.profile.tags.join(', '))
  const [generalConfigYaml, setGeneralConfigYaml] = useState(() => stringify(value.profile.generalConfig, { lineWidth: 0 }))
  const [ruleItems, setRuleItems] = useState<RuleEditorItem[]>(() => value.profile.ruleEntries.map(createRuleEditorItem))
  const [ruleProviders, setRuleProviders] = useState<RuleProvider[]>(() => structuredClone(value.profile.ruleProviders))
  const [selectedNodes, setSelectedNodes] = useState<Node[]>(() => structuredClone(value.profile.selectedNodes))
  const [listeners, setListeners] = useState<ListenerEntry[]>(() => structuredClone(value.profile.listeners))
  const [proxyGroups, setProxyGroups] = useState<ProxyGroup[]>(() => structuredClone(value.profile.proxyGroups))
  const [providers, setProviders] = useState<PassthroughProvider[]>(() => structuredClone(value.profile.passthroughProviders))
  const [preview, setPreview] = useState<Preview>()
  const [view, setView] = useState<'editor' | 'preview' | 'tokens'>('editor')
  const [saved, setSaved] = useState(false)
  const [editorError, setEditorError] = useState<unknown>()

  const nodes = useQuery({ queryKey: ['nodes'], queryFn: () => api<Node[]>('/api/nodes') })
  const providerPool = useQuery({ queryKey: ['providers'], queryFn: () => api<ProxyProvider[]>('/api/providers') })
  const rulePacks = useQuery({ queryKey: ['rule-packs'], queryFn: () => api<RulePack[]>('/api/rule-packs') })
  const ruleProviderPool = useQuery({ queryKey: ['rule-providers'], queryFn: () => api<RuleProvider[]>('/api/rule-providers') })

  function assembleProfile(): Profile {
    return {
      ...structuredClone(value.profile),
      name: name.trim(),
      tags: splitTags(tags),
      generalConfig: parseYamlObject(generalConfigYaml, 'GeneralConfig'),
      selectedNodes: structuredClone(selectedNodes),
      listeners: structuredClone(listeners),
      proxyGroups: structuredClone(proxyGroups),
      ruleEntries: ruleItems.map((item) => structuredClone(item.entry)),
      ruleProviders: structuredClone(ruleProviders),
      passthroughProviders: structuredClone(providers),
    }
  }

  const save = useMutation({
    mutationFn: () => put<ResolvedProfile>(`/api/profiles/${value.profile.id}`, { profile: assembleProfile() }),
    onMutate: () => { setEditorError(undefined); setSaved(false) },
    onSuccess: () => { setSaved(true); onChanged() },
    onError: setEditorError,
  })
  const compile = useMutation({
    mutationFn: () => post<Preview>('/api/profiles/preview', { profile: assembleProfile() }),
    onMutate: () => setEditorError(undefined),
    onSuccess: (result) => { setPreview(result); setView('preview') },
    onError: setEditorError,
  })
  const deletion = useMutation({
    mutationFn: () => remove(`/api/profiles/${value.profile.id}`),
    onSuccess: onDeleted,
  })

  const errors = preview?.diagnostics.filter((item) => item.severity === 'error').length ?? 0
  const warnings = preview?.diagnostics.filter((item) => item.severity === 'warning').length ?? 0

  return <section className="profile-editor">
    <header className="profile-editor-head"><div><p>PROFILE AGGREGATE</p><h2>{name || '未命名 Profile'}</h2><div className="tag-row">{splitTags(tags).map((tag) => <Badge key={tag}>#{tag}</Badge>)}</div></div>
      <div className="segmented"><button className={view === 'editor' ? 'active' : ''} onClick={() => setView('editor')}>结构化编辑</button><button className={view === 'preview' ? 'active' : ''} onClick={() => setView('preview')}>YAML 预览</button><button className={view === 'tokens' ? 'active' : ''} onClick={() => setView('tokens')}>订阅 Token</button></div>
    </header>
    <ErrorNotice error={editorError ?? save.error ?? compile.error ?? deletion.error ?? nodes.error ?? providerPool.error ?? rulePacks.error ?? ruleProviderPool.error} />
    {saved && <div className="notice notice-success profile-save-notice">Profile 已保存。</div>}
    {view === 'editor' && <div className="profile-structured-editor">
      <BasicSection name={name} tags={tags} onNameChange={setName} onTagsChange={setTags} />
      <GeneralConfigSection value={generalConfigYaml} onChange={setGeneralConfigYaml} />
      <RuleSection value={ruleItems} packs={rulePacks.data ?? []} onChange={setRuleItems} />
      <RuleProviderSelector pool={ruleProviderPool.data ?? []} value={ruleProviders} onChange={setRuleProviders} />
      <div className="profile-selector-grid">
        <ProxySelector pool={nodes.data ?? []} value={selectedNodes} onChange={setSelectedNodes} onPoolChanged={() => void client.invalidateQueries({ queryKey: ['nodes'] })} />
        <ListenerSelector pool={nodes.data ?? []} value={listeners} onChange={setListeners} />
      </div>
      <ProxyGroupSection value={proxyGroups} onChange={setProxyGroups} />
      <ProviderSelector pool={(providerPool.data ?? []).filter((item): item is PassthroughProvider => item.type === 'passthrough')} value={providers} onChange={setProviders} />
      <footer className="editor-actions structured-actions"><Button variant="danger" onClick={() => { if (confirm(`删除 ${value.profile.name} 及其全部订阅 Token？`)) deletion.mutate() }}>删除 Profile</Button><div><Button variant="quiet" onClick={() => compile.mutate()} disabled={compile.isPending}>生成预览</Button><Button onClick={() => save.mutate()} disabled={save.isPending}>保存 Profile</Button></div></footer>
    </div>}
    {view === 'preview' && <div className="preview-pane"><div className="diagnostic-summary"><span className={errors ? 'bad' : 'good'}>{errors} ERRORS</span><span className={warnings ? 'warn' : ''}>{warnings} WARNINGS</span><Button variant="quiet" onClick={() => compile.mutate()}>重新生成</Button></div>
      {preview ? <><div className="diagnostics">{preview.diagnostics.map((item, index) => <div key={`${item.code}-${index}`} className={item.severity}><b>{item.severity.toUpperCase()}</b><span>{item.message}<small>{item.location ?? item.code}</small></span></div>)}</div><pre className="yaml-preview">{preview.yaml}</pre></> : <Empty title="尚未生成预览" detail="预览会解析所有实时关联，展开 RulePack，并校验 Group 与 policy。" action={<Button onClick={() => compile.mutate()}>生成 YAML</Button>} />}
    </div>}
    {view === 'tokens' && <TokensPanel profileId={value.profile.id} />}
  </section>
}

function BasicSection({ name, tags, onNameChange, onTagsChange }: {
  name: string; tags: string; onNameChange(value: string): void; onTagsChange(value: string): void
}) {
  return <EditorSection title="基础信息" detail="名称与 Tag 独立维护。">
    <div className="form-grid"><Field label="Profile 名称" hideLabel><input placeholder="Profile 名称" required value={name} onChange={(event) => onNameChange(event.target.value)} /></Field><Field label="Tags" hideLabel><input placeholder="Tags，例如：demo, mihomo" value={tags} onChange={(event) => onTagsChange(event.target.value)} /></Field></div>
  </EditorSection>
}

function GeneralConfigSection({ value, onChange }: { value: string; onChange(value: string): void }) {
  return <EditorSection title="GeneralConfig" detail="使用 YAML 编辑；保存时编译为对象。">
    <Field label="GeneralConfig YAML" hint="proxies、listeners、proxy-groups、proxy-providers、rule-providers、rules 由下方编辑器生成，不应写在这里。"><textarea className="code-editor yaml-source-editor" rows={13} spellCheck={false} value={value} onChange={(event) => onChange(event.target.value)} /></Field>
  </EditorSection>
}

function RuleSection({ value, packs, onChange }: {
  value: RuleEditorItem[]; packs: RulePack[]; onChange(value: RuleEditorItem[]): void
}) {
  return <EditorSection title="规则编辑器" detail="RuleEntry 按列表顺序编译；拖动把手调整优先级。">
    <RuleListEditor value={value} onChange={onChange} rulePacks={packs} allowRulePacks emptyText="还没有 RuleEntry。至少添加一条 MATCH 或其他规则。" />
  </EditorSection>
}

function RuleProviderSelector({ pool, value, onChange }: {
  pool: RuleProvider[]; value: RuleProvider[]; onChange(value: RuleProvider[]): void
}) {
  const [open, setOpen] = useState(false)
  return <EditorSection title="Rule Provider 选择器" detail="选择要编译进此 Profile 的 Rule Provider。" actions={<Button onClick={() => setOpen(true)}>选择 Rule Provider</Button>}>
    <div className="resource-card-list provider-cards">{value.map((provider) => <ResourceCard
      key={provider.id}
      title={provider.name}
      detail={`${String(provider.config.type ?? 'unknown').toUpperCase()} · ${String(provider.config.behavior ?? 'unknown').toUpperCase()}`}
      onDelete={() => onChange(value.filter((item) => item.id !== provider.id))}
    />)}</div>
    {value.length === 0 && <InlineEmpty text="尚未选择 Rule Provider。" />}
    {open && <ChoiceDialog
      title="选择 Rule Provider"
      multiple
      items={pool.map((provider) => ({
        id: provider.id,
        title: provider.name,
        detail: `${String(provider.config.type ?? 'unknown').toUpperCase()} · ${String(provider.config.behavior ?? 'unknown').toUpperCase()}`,
      }))}
      selectedIds={value.map((provider) => provider.id)}
      onToggle={(id) => {
        const provider = pool.find((item) => item.id === id)
        if (provider) onChange(value.some((item) => item.id === id)
          ? value.filter((item) => item.id !== id)
          : [...value, provider])
      }}
      onClose={() => setOpen(false)}
    />}
  </EditorSection>
}

function ProxySelector({ pool, value, onChange, onPoolChanged }: { pool: Node[]; value: Node[]; onChange(value: Node[]): void; onPoolChanged(): void }) {
  const [open, setOpen] = useState(false)
  return <EditorSection title="Proxy 选择器" detail="从节点池选择；Provider 节点保持只读。" actions={<Button onClick={() => setOpen(true)}>选择 Proxy</Button>} compact>
    <div className="resource-card-list">{value.map((node) => <ResourceCard key={node.id} title={node.name} detail={`${node.type === 'provider' ? node.provider.name : 'USERDEFINED'} · ${String(node.proxy.server ?? '—')}:${String(node.proxy.port ?? '—')}`} tags={node.tags} onDelete={() => onChange(value.filter((item) => item.id !== node.id))} />)}</div>
    {value.length === 0 && <InlineEmpty text="尚未选择 Proxy。" />}
    {open && <ProxyPickerDialog pool={pool} selected={value} onChange={onChange} onPoolChanged={onPoolChanged} onClose={() => setOpen(false)} />}
  </EditorSection>
}

function ProxyPickerDialog({ pool, selected, onChange, onPoolChanged, onClose }: { pool: Node[]; selected: Node[]; onChange(value: Node[]): void; onPoolChanged(): void; onClose(): void }) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [tags, setTags] = useState('inline, profile')
  const [proxyYaml, setProxyYaml] = useState('type: ss\nserver: example.com\nport: 443\ncipher: aes-128-gcm\npassword: demo-password\n')
  const create = useMutation({
    mutationFn: () => post<Node>('/api/nodes', { name, tags: splitTags(tags), proxy: parseYamlObject(proxyYaml, 'Proxy') }),
    onSuccess: (node) => { onChange(upsertById(selected, node)); onPoolChanged(); setCreating(false) },
  })
  const selectedIds = new Set(selected.map((item) => item.id))
  return <Dialog title="选择 Profile Proxy" onClose={onClose}><div className="picker-toolbar"><Button variant="quiet" onClick={() => setCreating((value) => !value)}>＋ 内联创建 Proxy</Button></div>
    <ErrorNotice error={create.error} />
    {creating && <div className="inline-create-panel"><div className="form-grid"><Field label="名称"><input value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="Tags"><input value={tags} onChange={(event) => setTags(event.target.value)} /></Field></div><Field label="Proxy YAML"><textarea className="code-editor" rows={9} value={proxyYaml} onChange={(event) => setProxyYaml(event.target.value)} /></Field><Button disabled={create.isPending || !name.trim()} onClick={() => create.mutate()}>创建并选中</Button></div>}
    <div className="picker-options">{pool.map((node) => <button key={node.id} className={selectedIds.has(node.id) ? 'selected' : ''} onClick={() => onChange(selectedIds.has(node.id) ? selected.filter((item) => item.id !== node.id) : [...selected, node])}><span>{selectedIds.has(node.id) ? '✓' : '+'}</span><div><strong>{node.name}</strong><small>{node.type === 'provider' ? `${node.provider.name} · 只读` : 'USERDEFINED'} · {String(node.proxy.type).toUpperCase()}</small></div></button>)}</div>
    <div className="dialog-actions"><Button onClick={onClose}>完成选择</Button></div>
  </Dialog>
}

function ListenerSelector({ pool, value, onChange }: { pool: Node[]; value: ListenerEntry[]; onChange(value: ListenerEntry[]): void }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<number>()
  return <EditorSection title="Listener 选择器" detail="选择带模板的节点，或创建 Profile 内联 Listener。" actions={<Button onClick={() => setOpen(true)}>选择 Listener</Button>} compact>
    <div className="resource-card-list">{value.map((entry, index) => <ResourceCard key={`${entry.type}-${entry.type === 'derived' ? entry.node.id : index}`} title={entry.type === 'derived' ? entry.name : entry.listener.name} detail={entry.type === 'derived' ? `DERIVED · ${entry.node.name}` : `INLINE · ${entry.listener.type}`} {...(entry.type === 'userdefined' ? { onEdit: () => setEditing(index) } : {})} onDelete={() => onChange(value.filter((_, position) => position !== index))} />)}</div>
    {value.length === 0 && <InlineEmpty text="尚未选择 Listener。" />}
    {open && <ListenerPickerDialog pool={pool} value={value} onChange={onChange} onClose={() => setOpen(false)} />}
    {editing !== undefined && value[editing]?.type === 'userdefined' && <ListenerEditDialog value={value[editing]} onSave={(entry) => { onChange(value.map((current, index) => index === editing ? entry : current)); setEditing(undefined) }} onClose={() => setEditing(undefined)} />}
  </EditorSection>
}

function ListenerPickerDialog({ pool, value, onChange, onClose }: { pool: Node[]; value: ListenerEntry[]; onChange(value: ListenerEntry[]): void; onClose(): void }) {
  const [creating, setCreating] = useState(false)
  const [listenerYaml, setListenerYaml] = useState('name: Profile Mixed Inbound\ntype: mixed\nlisten: 127.0.0.1\nport: 7893\n')
  const [error, setError] = useState<unknown>()
  const candidates = pool.filter((node): node is UserDefinedNode => node.type === 'userdefined' && node.listenerTemplate !== undefined)
  const derivedIds = new Set(value.filter((entry) => entry.type === 'derived').map((entry) => entry.node.id))
  function addInline() {
    try {
      const listener = parseYamlObject(listenerYaml, 'Listener') as Listener
      if (typeof listener.name !== 'string' || typeof listener.type !== 'string') throw new Error('Listener 必须包含 name 和 type')
      onChange([...value, { type: 'userdefined', listener }]); setCreating(false); setError(undefined)
    } catch (cause) { setError(cause) }
  }
  return <Dialog title="选择 Profile Listener" onClose={onClose}><div className="picker-toolbar"><Button variant="quiet" onClick={() => setCreating((value) => !value)}>＋ 内联创建 Listener</Button></div>
    <ErrorNotice error={error} />
    {creating && <div className="inline-create-panel"><Field label="Listener YAML"><textarea className="code-editor" rows={9} value={listenerYaml} onChange={(event) => setListenerYaml(event.target.value)} /></Field><Button onClick={addInline}>创建并选中</Button></div>}
    <div className="picker-options">{candidates.map((node) => <button key={node.id} className={derivedIds.has(node.id) ? 'selected' : ''} onClick={() => onChange(derivedIds.has(node.id) ? value.filter((entry) => entry.type !== 'derived' || entry.node.id !== node.id) : [...value, { type: 'derived', name: `${node.name} Listener`, node }])}><span>{derivedIds.has(node.id) ? '✓' : '+'}</span><div><strong>{node.name}</strong><small>{String(node.listenerTemplate?.type).toUpperCase()} TEMPLATE</small></div></button>)}</div>
    {candidates.length === 0 && <InlineEmpty text="节点池里没有配置 ListenerTemplate 的 UserDefined Node。" />}
    <div className="dialog-actions"><Button onClick={onClose}>完成选择</Button></div>
  </Dialog>
}

function ListenerEditDialog({ value, onSave, onClose }: {
  value: Extract<ListenerEntry, { type: 'userdefined' }>
  onSave(value: ListenerEntry): void
  onClose(): void
}) {
  const [text, setText] = useState(() => stringify(value.listener, { lineWidth: 0 }))
  const [error, setError] = useState<unknown>()
  function save() {
    try {
      const object = parseYamlObject(text, 'Listener')
      if (typeof object.name !== 'string' || typeof object.type !== 'string') throw new Error('Listener 必须包含 name 和 type')
      onSave({ type: 'userdefined', listener: object as Listener })
    } catch (cause) { setError(cause) }
  }
  return <Dialog title="编辑内联 Listener" onClose={onClose}><ErrorNotice error={error} /><Field label="Listener YAML"><textarea className="code-editor" rows={12} value={text} onChange={(event) => setText(event.target.value)} /></Field><div className="dialog-actions"><Button variant="quiet" onClick={onClose}>取消</Button><Button onClick={save}>保存 Listener</Button></div></Dialog>
}

function ProxyGroupSection({ value, onChange }: { value: ProxyGroup[]; onChange(value: ProxyGroup[]): void }) {
  const [editing, setEditing] = useState<number | 'new'>()
  return <EditorSection title="ProxyGroup 卡片组" detail="每张卡片保存一个原始 YAML 对象。" actions={<Button onClick={() => setEditing('new')}>＋ 创建 ProxyGroup</Button>}>
    <div className="proxy-group-grid">{value.map((group, index) => <article key={`${group.name}-${index}`} className="proxy-group-card"><header><div><strong>{group.name}</strong><small>{group.type.toUpperCase()}</small></div></header><pre>{stringify(group, { lineWidth: 0 }).trim()}</pre><footer><Button variant="quiet" onClick={() => setEditing(index)}>编辑 YAML</Button><Button variant="danger" onClick={() => onChange(value.filter((_, position) => position !== index))}>删除</Button></footer></article>)}</div>
    {value.length === 0 && <InlineEmpty text="尚未创建 ProxyGroup。" />}
    {editing !== undefined && <ProxyGroupDialog {...(editing === 'new' ? {} : { value: value[editing] })} onSave={(group) => { onChange(editing === 'new' ? [...value, group] : value.map((current, index) => index === editing ? group : current)); setEditing(undefined) }} onClose={() => setEditing(undefined)} />}
  </EditorSection>
}

function ProxyGroupDialog({ value, onSave, onClose }: { value?: ProxyGroup; onSave(value: ProxyGroup): void; onClose(): void }) {
  const [text, setText] = useState(() => stringify(value ?? { name: '新建策略组', type: 'select', proxies: ['DIRECT'] }, { lineWidth: 0 }))
  const [error, setError] = useState<unknown>()
  function save() {
    try {
      const group = parseYamlObject(text, 'ProxyGroup') as ProxyGroup
      if (typeof group.name !== 'string' || typeof group.type !== 'string') throw new Error('ProxyGroup 必须包含 name 和 type')
      onSave(group)
    } catch (cause) { setError(cause) }
  }
  return <Dialog title={value ? '编辑 ProxyGroup YAML' : '创建 ProxyGroup YAML'} onClose={onClose}><ErrorNotice error={error} /><Field label="原始 YAML 条目"><textarea autoFocus className="code-editor" rows={18} value={text} onChange={(event) => setText(event.target.value)} /></Field><div className="dialog-actions"><Button variant="quiet" onClick={onClose}>取消</Button><Button onClick={save}>保存 ProxyGroup</Button></div></Dialog>
}

function ProviderSelector({ pool, value, onChange }: { pool: PassthroughProvider[]; value: PassthroughProvider[]; onChange(value: PassthroughProvider[]): void }) {
  const [open, setOpen] = useState(false)
  return <EditorSection title="Provider 选择器" detail="选择要原样编译进 Profile 的 PassthroughProvider。" actions={<Button onClick={() => setOpen(true)}>选择 Provider</Button>}>
    <div className="resource-card-list provider-cards">{value.map((provider) => <ResourceCard key={provider.id} title={provider.name} detail={`${provider.url} · ${provider.interval}s`} onDelete={() => onChange(value.filter((item) => item.id !== provider.id))} />)}</div>
    {value.length === 0 && <InlineEmpty text="尚未选择 PassthroughProvider。" />}
    {open && <ChoiceDialog title="选择 PassthroughProvider" multiple items={pool.map((provider) => ({ id: provider.id, title: provider.name, detail: `${provider.url} · ${provider.interval}s` }))} selectedIds={value.map((item) => item.id)} onToggle={(id) => { const provider = pool.find((item) => item.id === id); if (provider) onChange(value.some((item) => item.id === id) ? value.filter((item) => item.id !== id) : [...value, provider]) }} onClose={() => setOpen(false)} />}
  </EditorSection>
}

function EditorSection({ title, detail, actions, compact = false, children }: React.PropsWithChildren<{ title: string; detail: string; actions?: React.ReactNode; compact?: boolean }>) {
  return <section className={`structured-section ${compact ? 'compact' : ''}`}><header><div><h3>{title}</h3><p>{detail}</p></div>{actions && <div className="section-actions">{actions}</div>}</header><div className="structured-section-body">{children}</div></section>
}

function ResourceCard({ title, detail, tags = [], onEdit, onDelete }: { title: string; detail: string; tags?: string[]; onEdit?(): void; onDelete(): void }) {
  return <article className="selected-resource-card"><div><strong>{title}</strong><small>{detail}</small>{tags.length > 0 && <p>{tags.map((tag) => `#${tag}`).join(' ')}</p>}</div><div>{onEdit && <button onClick={onEdit}>编辑</button>}<button onClick={onDelete}>移除</button></div></article>
}

function ChoiceDialog({ title, items, selectedIds = [], multiple = false, onSelect, onToggle, onClose }: { title: string; items: Array<{ id: string; title: string; detail: string }>; selectedIds?: string[]; multiple?: boolean; onSelect?(id: string): void; onToggle?(id: string): void; onClose(): void }) {
  const selected = new Set(selectedIds)
  return <Dialog title={title} onClose={onClose}><div className="picker-options">{items.map((item) => <button key={item.id} className={selected.has(item.id) ? 'selected' : ''} onClick={() => multiple ? onToggle?.(item.id) : onSelect?.(item.id)}><span>{selected.has(item.id) ? '✓' : '+'}</span><div><strong>{item.title}</strong><small>{item.detail}</small></div></button>)}</div>{items.length === 0 && <InlineEmpty text="当前没有可选择的对象。" />}<div className="dialog-actions">{multiple && <Button onClick={onClose}>完成选择</Button>}</div></Dialog>
}

function InlineEmpty({ text }: { text: string }) { return <div className="inline-empty">{text}</div> }

function TokensPanel({ profileId }: { profileId: string }) {
  const [note, setNote] = useState('')
  const tokens = useQuery({ queryKey: ['tokens', profileId], queryFn: () => api<SubscriptionToken[]>(`/api/profiles/${profileId}/tokens`) })
  const issue = useMutation({ mutationFn: () => post<SubscriptionToken>(`/api/profiles/${profileId}/tokens`, { ...(note ? { note } : {}) }), onSuccess: () => { setNote(''); void tokens.refetch() } })
  const revoke = useMutation({ mutationFn: (id: string) => remove(`/api/tokens/${id}`), onSuccess: () => void tokens.refetch() })
  return <div className="tokens-pane"><div className="token-create"><div><p>SUBSCRIPTION ACCESS</p><h3>签发可重复读取的 Token</h3><span>管理接口会返回完整明文；数据库同时保存摘要与加密密文。</span></div><div><Field label="备注" hideLabel><input value={note} placeholder="备注，例如：手机" onChange={(event) => setNote(event.target.value)} /></Field><Button onClick={() => issue.mutate()} disabled={issue.isPending}>签发 Token</Button></div></div>
    <ErrorNotice error={tokens.error ?? issue.error ?? revoke.error} />
    <div className="token-list">{tokens.data?.map((token) => <article key={token.id}><div><h4>{token.note || '未命名设备'}</h4><code>{token.token}</code><p>{token.subscriptionUrl}</p></div><div className="row-actions"><Button variant="quiet" onClick={() => void navigator.clipboard.writeText(token.subscriptionUrl)}>复制 URL</Button><Button variant="danger" onClick={() => { if (confirm('撤销后旧 URL 会立即失效，继续？')) revoke.mutate(token.id) }}>撤销</Button></div></article>)}</div>
    {!tokens.isLoading && tokens.data?.length === 0 && <Empty title="没有订阅 Token" detail="签发后可以在任何兼容 Mihomo 的客户端使用固定 URL。" />}
  </div>
}

function splitTags(value: string): string[] { return value.split(',').map((item) => item.trim()).filter(Boolean) }
function upsertById<T extends { id: string }>(items: T[], value: T): T[] { return [...items.filter((item) => item.id !== value.id), value] }
