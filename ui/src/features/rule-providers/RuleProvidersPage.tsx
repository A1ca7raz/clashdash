import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { stringify } from 'yaml'

import type { RuleProvider } from '../../../../src/domain/models/rule-provider.ts'
import { api, post, put, remove } from '../../api/client.ts'
import { Badge, Button, Dialog, Empty, ErrorNotice, Field, YamlEditor } from '../../components/ui.tsx'
import { PageHeader } from '../../components/Layout.tsx'
import { parseYamlObject } from '../../lib/yaml.ts'

export function RuleProvidersPage() {
  const client = useQueryClient()
  const providers = useQuery({
    queryKey: ['rule-providers'],
    queryFn: () => api<RuleProvider[]>('/api/rule-providers'),
  })
  const [editing, setEditing] = useState<RuleProvider | 'new'>()

  function refreshDependents() {
    void Promise.all([
      client.invalidateQueries({ queryKey: ['rule-providers'] }),
      client.invalidateQueries({ queryKey: ['rule-packs'] }),
      client.invalidateQueries({ queryKey: ['profiles'] }),
    ])
  }

  function completed() {
    setEditing(undefined)
    refreshDependents()
  }

  return <>
    <PageHeader
      title="规则 Provider"
      detail="维护由 Mihomo 拉取或直接内联的规则集合。"
      actions={<Button onClick={() => setEditing('new')}>＋ 新建 Rule Provider</Button>}
    />
    <ErrorNotice error={providers.error} />
    {providers.data?.length
      ? <div className="management-card-grid">{providers.data.map((provider) => <button
          key={provider.id}
          className="management-card rule-provider-management-card"
          onClick={() => setEditing(provider)}
        >
          <header><Badge tone="cyan">{String(provider.config.type ?? 'unknown').toUpperCase()}</Badge></header>
          <div><h2>{provider.name}</h2><p>{providerSource(provider)}</p></div>
          <div className="management-card-stats">
            <span><b>{String(provider.config.behavior ?? '—').toUpperCase()}</b> BEHAVIOR</span>
            <span><b>{String(provider.config.format ?? defaultFormat(provider)).toUpperCase()}</b> FORMAT</span>
            <span><b>{providerAmount(provider)}</b> {provider.config.type === 'inline' ? 'PAYLOAD' : 'INTERVAL'}</span>
          </div>
          <footer><span>MIHOMO RULE PROVIDER</span><b>编辑配置 <i>↗</i></b></footer>
        </button>)}</div>
      : !providers.isLoading && <Empty
          title="还没有 Rule Provider"
          detail="创建 HTTP 或 Inline Rule Provider，并在 Profile 中选择使用。"
          action={<Button onClick={() => setEditing('new')}>新建第一个 Rule Provider</Button>}
        />}
    {editing && <RuleProviderDialog
      key={editing === 'new' ? 'new' : editing.id}
      {...(editing === 'new' ? {} : { value: editing })}
      onDone={completed}
      onDeleted={completed}
      onClose={() => setEditing(undefined)}
    />}
  </>
}

function RuleProviderDialog({ value, onDone, onDeleted, onClose }: {
  value?: RuleProvider
  onDone(provider: RuleProvider): void
  onDeleted(): void
  onClose(): void
}) {
  const [name, setName] = useState(value?.name ?? '')
  const [yaml, setYaml] = useState(() => stringify(value?.config ?? defaultConfig(), { lineWidth: 0 }))
  const [parseError, setParseError] = useState<unknown>()
  const save = useMutation({
    mutationFn: () => {
      const config = parseYamlObject(yaml, 'Rule Provider')
      return value
        ? put<RuleProvider>(`/api/rule-providers/${value.id}`, { name, config })
        : post<RuleProvider>('/api/rule-providers', { name, config })
    },
    onMutate: () => setParseError(undefined),
    onSuccess: onDone,
    onError: setParseError,
  })
  const deletion = useMutation({
    mutationFn: () => remove(`/api/rule-providers/${value?.id}`),
    onSuccess: onDeleted,
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    try {
      parseYamlObject(yaml, 'Rule Provider')
      save.mutate()
    } catch (cause) {
      setParseError(cause)
    }
  }

  return <Dialog title={value ? `编辑 ${value.name}` : '新建 Rule Provider'} onClose={onClose}>
    <form className="rule-provider-dialog-form" onSubmit={submit}>
      <ErrorNotice error={parseError ?? save.error ?? deletion.error} />
      <Field label="Rule Provider 名称"><input autoFocus required placeholder="唯一名称，例如 reject-domains" value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <Field label="Mihomo 配置 YAML"><YamlEditor value={yaml} onChange={setYaml} rows={19} /></Field>
      <div className="dialog-actions rule-provider-dialog-actions">
        {value
          ? <Button type="button" variant="danger" disabled={deletion.isPending} onClick={() => {
              if (confirm(`删除 ${value.name}？存在 Profile 或 RULE-SET 引用时会拒绝。`)) deletion.mutate()
            }}>删除</Button>
          : <span />}
        <div><Button type="button" variant="quiet" onClick={onClose}>取消</Button><Button disabled={save.isPending}>保存</Button></div>
      </div>
    </form>
  </Dialog>
}

function defaultConfig() {
  return {
    type: 'http', behavior: 'classical', format: 'yaml',
    url: 'https://example.com/rules.yaml', interval: 86_400,
  }
}

function providerSource(provider: RuleProvider): string {
  if (provider.config.type === 'inline') return `${providerAmount(provider)} 条内联规则`
  const url = provider.config.url
  if (typeof url !== 'string') return '未配置 URL'
  try { return new URL(url).hostname }
  catch { return url }
}

function providerAmount(provider: RuleProvider): string | number {
  if (provider.config.type === 'inline') return Array.isArray(provider.config.payload) ? provider.config.payload.length : 0
  return typeof provider.config.interval === 'number' ? `${provider.config.interval}s` : '—'
}

function defaultFormat(provider: RuleProvider): string {
  return provider.config.type === 'inline' ? 'inline' : 'yaml'
}
