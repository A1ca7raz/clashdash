import { useState } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import type { Rule, RuleEntry, RulePack } from '../../../../src/domain/models/rule.ts'
import { Badge, Button, Dialog, Field } from '../../components/ui.tsx'

export type RuleEditorItem = { editorId: string; entry: RuleEntry }

export function createRuleEditorItem(entry: RuleEntry): RuleEditorItem {
  return { editorId: crypto.randomUUID(), entry: structuredClone(entry) }
}

export function RuleListEditor({
  value, onChange, rulePacks = [], allowRulePacks = false, emptyText = '还没有 Rule。',
}: {
  value: RuleEditorItem[]
  onChange(value: RuleEditorItem[]): void
  rulePacks?: RulePack[]
  allowRulePacks?: boolean
  emptyText?: string
}) {
  const [packPickerOpen, setPackPickerOpen] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  function dragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return
    const from = value.findIndex((item) => item.editorId === event.active.id)
    const to = value.findIndex((item) => item.editorId === event.over?.id)
    if (from >= 0 && to >= 0) onChange(arrayMove(value, from, to))
  }
  return <div className="shared-rule-editor">
    <div className="rule-editor-toolbar"><div>
      {allowRulePacks && <Button variant="quiet" type="button" onClick={() => setPackPickerOpen(true)}>＋ RulePack</Button>}
      <Button type="button" onClick={() => onChange([...value, createRuleEditorItem({ type: 'rule', rule: defaultRule() })])}>＋ 内联 Rule</Button>
    </div></div>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}><SortableContext items={value.map((item) => item.editorId)} strategy={verticalListSortingStrategy}>
      <div className="rule-card-list">{value.map((item, index) => <SortableRuleCard key={item.editorId} item={item} index={index} onChange={(entry) => onChange(value.map((current) => current.editorId === item.editorId ? { ...current, entry } : current))} onDelete={() => onChange(value.filter((current) => current.editorId !== item.editorId))} />)}</div>
    </SortableContext></DndContext>
    {value.length === 0 && <div className="inline-empty">{emptyText}</div>}
    {packPickerOpen && <RulePackChoiceDialog packs={rulePacks} onSelect={(pack) => { onChange([...value, createRuleEditorItem({ type: 'rulePack', rulePack: pack })]); setPackPickerOpen(false) }} onClose={() => setPackPickerOpen(false)} />}
  </div>
}

function SortableRuleCard({ item, index, onChange, onDelete }: { item: RuleEditorItem; index: number; onChange(entry: RuleEntry): void; onDelete(): void }) {
  const sortable = useSortable({ id: item.editorId })
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }
  return <article ref={sortable.setNodeRef} style={style} className={`rule-row-card ${sortable.isDragging ? 'dragging' : ''}`}>
    <button type="button" className="drag-handle" aria-label={`拖动规则 ${index + 1}`} {...sortable.attributes} {...sortable.listeners}>⠿</button>
    <b className="rule-order">{String(index + 1).padStart(2, '0')}</b>
    {item.entry.type === 'rule' ? <InlineRuleFields value={item.entry.rule} onChange={(rule) => onChange({ type: 'rule', rule })} /> : <div className="rule-pack-summary"><Badge tone="cyan">RULEPACK</Badge><div><strong>{item.entry.rulePack.name}</strong><small>{item.entry.rulePack.rules.length} RULES · 保存完整对象</small></div></div>}
    <button type="button" className="row-delete" aria-label={`删除规则 ${index + 1}`} onClick={onDelete}>删除</button>
  </article>
}

function InlineRuleFields({ value, onChange }: { value: Rule; onChange(value: Rule): void }) {
  return <div className="inline-rule-fields"><Field label="Type" hideLabel><input placeholder="Type，例如 DOMAIN-SUFFIX" value={value.type} onChange={(event) => onChange({ ...value, type: event.target.value })} /></Field><Field label="Parameters" hideLabel><input placeholder="Parameters，逗号分隔" value={value.parameters.join(', ')} onChange={(event) => onChange({ ...value, parameters: splitComma(event.target.value) })} /></Field><Field label="Policy" hideLabel><input placeholder="Policy，例如 DIRECT" value={value.policy} onChange={(event) => onChange({ ...value, policy: event.target.value })} /></Field><Field label="Modifiers" hideLabel><input placeholder="Modifiers，可选" value={(value.modifiers ?? []).join(', ')} onChange={(event) => { const modifiers = splitComma(event.target.value); onChange({ type: value.type, parameters: value.parameters, policy: value.policy, ...(modifiers.length ? { modifiers } : {}) }) }} /></Field></div>
}

function RulePackChoiceDialog({ packs, onSelect, onClose }: { packs: RulePack[]; onSelect(pack: RulePack): void; onClose(): void }) {
  return <Dialog title="选择 RulePack" onClose={onClose}><div className="picker-options">{packs.map((pack) => <button type="button" key={pack.id} onClick={() => onSelect(pack)}><span>+</span><div><strong>{pack.name}</strong><small>{pack.rules.length} 条完整 Rule</small></div></button>)}</div>{packs.length === 0 && <div className="inline-empty">当前没有可选择的 RulePack。</div>}</Dialog>
}

function defaultRule(): Rule {
  return { type: 'DOMAIN-SUFFIX', parameters: ['example.com'], policy: 'DIRECT' }
}

function splitComma(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}
