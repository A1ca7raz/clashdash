import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'

import type { Rule, RulePack } from '../../../../src/domain/models/rule.ts'
import { api, post, put, remove } from '../../api/client.ts'
import { Badge, Button, Empty, ErrorNotice, Field } from '../../components/ui.tsx'
import { PageHeader } from '../../components/Layout.tsx'
import { createRuleEditorItem, RuleListEditor, type RuleEditorItem } from './RuleListEditor.tsx'

export function RulesPage() {
  const navigate = useNavigate()
  const packs = useQuery({ queryKey: ['rule-packs'], queryFn: () => api<RulePack[]>('/api/rule-packs') })

  return <>
    <PageHeader
      title="规则包"
      detail="按用途组织可复用的完整 Rule 列表。"
      actions={<Button onClick={() => navigate('/rules/new')}>＋ 新建规则包</Button>}
    />
    <ErrorNotice error={packs.error} />
    {packs.data?.length
      ? <div className="management-card-grid">{packs.data.map((pack) => <button
          key={pack.id}
          className="management-card"
          onClick={() => navigate(`/rules/${pack.id}`)}
        >
          <header><Badge tone="cyan">{pack.rules.length} RULES</Badge></header>
          <div><h2>{pack.name}</h2><p>{ruleTypeSummary(pack.rules)}</p></div>
          <footer><span>完整 Rule 列表</span><b>查看详情 <i>→</i></b></footer>
        </button>)}</div>
      : !packs.isLoading && <Empty
          title="还没有规则包"
          detail="新建 RulePack，并在独立详情页维护完整 Rule。"
          action={<Button onClick={() => navigate('/rules/new')}>新建第一个规则包</Button>}
        />}
  </>
}

export function RulePackDetailPage({ creating = false }: { creating?: boolean }) {
  const navigate = useNavigate()
  const client = useQueryClient()
  const { id } = useParams()
  const pack = useQuery({
    queryKey: ['rule-packs', id],
    queryFn: () => api<RulePack>(`/api/rule-packs/${id}`),
    enabled: !creating && Boolean(id),
  })

  function changed(value: RulePack) {
    void Promise.all([
      client.invalidateQueries({ queryKey: ['rule-packs'] }),
      client.invalidateQueries({ queryKey: ['rule-packs', value.id] }),
    ])
    navigate(`/rules/${value.id}`, { replace: creating })
  }

  return <>
    <PageHeader
      title={creating ? '新建规则包' : pack.data?.name ?? '规则包详情'}
      detail="维护规则顺序、匹配参数、策略与修饰符。"
      actions={<Button variant="quiet" onClick={() => navigate('/rules')}>← 返回列表</Button>}
    />
    <ErrorNotice error={pack.error} />
    <section className="detail-editor-surface">
      {creating
        ? <RulePackEditor onDone={changed} onCancel={() => navigate('/rules')} />
        : pack.data
          ? <RulePackEditor
              key={pack.data.id}
              value={pack.data}
              onDone={changed}
              onDeleted={() => {
                void client.invalidateQueries({ queryKey: ['rule-packs'] })
                navigate('/rules')
              }}
            />
          : !pack.isLoading && !pack.error && <Empty title="规则包不存在" detail="该规则包可能已被删除。" />}
    </section>
  </>
}

function RulePackEditor({ value, onDone, onDeleted, onCancel }: {
  value?: RulePack; onDone(pack: RulePack): void; onDeleted?(): void; onCancel?(): void
}) {
  const [name, setName] = useState(value?.name ?? '')
  const [rules, setRules] = useState<RuleEditorItem[]>(() => (value?.rules ?? [
    { type: 'DOMAIN-SUFFIX', parameters: ['example.com'], policy: 'DIRECT' },
    { type: 'MATCH', parameters: [], policy: 'DIRECT' },
  ]).map((rule) => createRuleEditorItem({ type: 'rule', rule })))
  const save = useMutation({ mutationFn: () => value
    ? put<RulePack>(`/api/rule-packs/${value.id}`, { name, rules: extractRules(rules) })
    : post<RulePack>('/api/rule-packs', { name, rules: extractRules(rules) }), onSuccess: onDone })
  const deletion = useMutation({
    mutationFn: () => remove(`/api/rule-packs/${value?.id}`),
    ...(onDeleted ? { onSuccess: onDeleted } : {}),
  })

  function submit(event: FormEvent) { event.preventDefault(); save.mutate() }
  return <form className="aggregate-editor" onSubmit={submit}>
    <header><div><p>{value ? 'EDIT RULE PACK' : 'NEW RULE PACK'}</p><h2>{name || '未命名规则包'}</h2></div><Badge tone="cyan">{rules.length} RULES</Badge></header>
    <ErrorNotice error={save.error ?? deletion.error} />
    <Field label="规则包名称"><input required placeholder="规则包名称" value={name} onChange={(event) => setName(event.target.value)} /></Field>
    <div className="rule-pack-rule-editor"><div className="editor-label"><span>完整 Rule 列表</span><small>拖拽调整编译顺序</small></div><RuleListEditor value={rules} onChange={setRules} emptyText="规则包还没有 Rule。" /></div>
    <footer className="editor-actions">{value ? <Button type="button" variant="danger" disabled={deletion.isPending} onClick={() => { if (confirm(`删除 ${value.name}？被 Profile 使用时会拒绝。`)) deletion.mutate() }}>删除规则包</Button> : <Button type="button" variant="quiet" onClick={onCancel}>取消</Button>}<Button disabled={save.isPending}>整体保存</Button></footer>
  </form>
}

function extractRules(items: RuleEditorItem[]): Rule[] {
  return items.map((item) => {
    if (item.entry.type !== 'rule') throw new Error('RulePack cannot contain another RulePack')
    return structuredClone(item.entry.rule)
  })
}

function ruleTypeSummary(rules: Rule[]): string {
  if (rules.length === 0) return '尚未添加 Rule'
  const types = [...new Set(rules.map((rule) => rule.type.toUpperCase()))]
  return types.slice(0, 4).join(' · ') + (types.length > 4 ? ` · +${types.length - 4}` : '')
}
