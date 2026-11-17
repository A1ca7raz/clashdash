"use client";

import { ClipboardPasteIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { SortableList } from "@/components/sortable-list";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRun } from "@/components/use-run";
import type { Rule } from "@/db/schema";
import { ruleLine } from "@/lib/generator";
import { DIVIDER_RULE_TYPE, type EditorRuleType } from "@/lib/types";
import {
  bulkAddRules,
  createSubRule,
  deleteRule,
  deleteSubRule,
  renameSubRuleAction,
  reorder,
  saveRule,
  setRuleEnabled,
} from "@/server/actions/profiles";
import { useEditor } from "./context";
import { EMPTY_RULE, RuleForm, type RuleDraft } from "./rule-form";

const MAIN = "__main__";

const validRule = (draft: RuleDraft) =>
  draft.type === DIVIDER_RULE_TYPE || (!!draft.target && (draft.type === "MATCH" || !!draft.payload));
const ruleDescription = (rule: Rule) => (rule.type === DIVIDER_RULE_TYPE ? rule.payload || "分隔线" : ruleLine(rule));

export function RulesTab() {
  const { profile, rules, subRuleNames } = useEditor();
  const [pending, run] = useRun();
  const [current, setCurrent] = useState<string | null>(null);
  const [draft, setDraft] = useState<RuleDraft>(EMPTY_RULE);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [dialog, setDialog] = useState<"create" | "rename" | "bulk" | null>(null);

  const activeSet = current && subRuleNames.includes(current) ? current : null;
  const list = rules.filter((r) => (r.subRule ?? null) === activeSet);
  const ruleNumbers = new Map(list.filter((r) => r.type !== DIVIDER_RULE_TYPE).map((r, index) => [r.id, index + 1]));

  const add = () =>
    run(() => saveRule({ profileId: profile.id, subRule: activeSet, ...draft, enabled: true }), {
      onOk: () => setDraft({ ...EMPTY_RULE, type: draft.type, target: draft.target }),
    });

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-1">
        <Select value={activeSet ?? MAIN} onValueChange={(v) => setCurrent(v === MAIN ? null : v)}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={MAIN}>主规则（rules）</SelectItem>
            {subRuleNames.map((n) => (
              <SelectItem key={n} value={n}>
                子规则：{n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => setDialog("create")}>
          <PlusIcon />
          新建子规则
        </Button>
        {activeSet && (
          <>
            <Button variant="ghost" size="sm" onClick={() => setDialog("rename")}>
              重命名
            </Button>
            <ConfirmButton
              title={`删除子规则「${activeSet}」？`}
              description="其中的全部规则会被删除。被规则或监听器引用时无法删除。"
              variant="ghost"
              size="sm"
              onConfirm={() => run(() => deleteSubRule(profile.id, activeSet), { success: "已删除", onOk: () => setCurrent(null) })}
            >
              删除子规则
            </ConfirmButton>
          </>
        )}
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => setDialog("bulk")}>
          <ClipboardPasteIcon />
          批量导入
        </Button>
      </div>

      <div className="grid gap-3 border-y py-4">
        <RuleForm value={draft} onChange={setDraft} currentSet={activeSet} />
        <div>
          <Button size="sm" onClick={add} disabled={pending || !validRule(draft)}>
            <PlusIcon />
            添加规则
          </Button>
          <span className="ml-3 text-xs text-muted-foreground">新规则会插入到末尾的 MATCH 之前。</span>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="py-8 text-sm text-muted-foreground">没有规则</div>
      ) : (
        <SortableList
          items={list}
          className="rounded-lg border"
          onReorder={(ids) => run(() => reorder("rules", profile.id, ids))}
          renderItem={(r) => (
            <div className={`flex items-center gap-3 ${r.enabled || r.type === DIVIDER_RULE_TYPE ? "" : "opacity-50"}`}>
              {r.type !== DIVIDER_RULE_TYPE && (
                <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">{ruleNumbers.get(r.id)}</span>
              )}
              <div className="min-w-0 flex-1">
                {r.type === DIVIDER_RULE_TYPE ? (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {r.payload && <span className="max-w-1/2 truncate">{r.payload}</span>}
                    <div className="h-px min-w-8 flex-1 bg-border" />
                  </div>
                ) : (
                  <div className="truncate font-mono text-[13px]">{ruleLine(r)}</div>
                )}
                {r.remark && <div className="truncate text-xs text-muted-foreground">{r.remark}</div>}
              </div>
              {r.type !== DIVIDER_RULE_TYPE && (
                <Switch checked={r.enabled} onCheckedChange={(v) => run(() => setRuleEnabled(r.id, v))} />
              )}
              <Button variant="ghost" size="icon-sm" onClick={() => setEditing(r)}>
                <PencilIcon />
              </Button>
              <ConfirmButton title="删除这条规则？" description={ruleDescription(r)} onConfirm={() => run(() => deleteRule(r.id))}>
                <Trash2Icon />
              </ConfirmButton>
            </div>
          )}
        />
      )}

      {editing && <EditRuleDialog rule={editing} onClose={() => setEditing(null)} />}
      {dialog === "create" && (
        <NameDialog
          title="新建子规则"
          description="子规则以 sub-rules 输出，可被 SUB-RULE 规则或监听器引用。新建时会自动加入一条 MATCH,DIRECT。"
          onClose={() => setDialog(null)}
          onSubmit={(name) => run(() => createSubRule(profile.id, name), { onOk: (n) => (setCurrent(n), setDialog(null)) })}
        />
      )}
      {dialog === "rename" && activeSet && (
        <NameDialog
          title="重命名子规则"
          description="引用它的 SUB-RULE 规则和监听器会同步更新。"
          initial={activeSet}
          onClose={() => setDialog(null)}
          onSubmit={(name) =>
            run(() => renameSubRuleAction(profile.id, activeSet, name), { onOk: (n) => (setCurrent(n), setDialog(null)) })
          }
        />
      )}
      {dialog === "bulk" && <BulkDialog subRule={activeSet} onClose={() => setDialog(null)} />}
    </div>
  );
}

function EditRuleDialog({ rule, onClose }: { rule: Rule; onClose: () => void }) {
  const { profile } = useEditor();
  const [pending, run] = useRun();
  const [draft, setDraft] = useState<RuleDraft>({
    type: rule.type as EditorRuleType,
    payload: rule.payload,
    target: rule.target,
    noResolve: rule.noResolve,
    remark: rule.remark ?? "",
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>编辑规则</DialogTitle>
        </DialogHeader>
        <RuleForm value={draft} onChange={setDraft} currentSet={rule.subRule} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={pending || !validRule(draft)}
            onClick={() =>
              run(() => saveRule({ id: rule.id, profileId: profile.id, subRule: rule.subRule, enabled: rule.enabled, ...draft }), {
                success: "已保存",
                onOk: onClose,
              })
            }
          >
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NameDialog({
  title,
  description,
  initial = "",
  onClose,
  onSubmit,
}: {
  title: string;
  description: string;
  initial?: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="名称（不含逗号和空白）" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button disabled={!name.trim()} onClick={() => onSubmit(name.trim())}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkDialog({ subRule, onClose }: { subRule: string | null; onClose: () => void }) {
  const { profile } = useEditor();
  const [pending, run] = useRun();
  const [text, setText] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>批量导入规则</DialogTitle>
          <DialogDescription>
            每行一条，格式与 mihomo 相同，例如 DOMAIN-SUFFIX,google.com,🚀 节点选择 或 IP-CIDR,10.0.0.0/8,DIRECT,no-resolve。可直接粘贴 YAML
            列表；以 # 开头的行会被忽略。
          </DialogDescription>
        </DialogHeader>
        <Textarea className="h-72 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={pending || !text.trim()}
            onClick={() => run(() => bulkAddRules(profile.id, subRule, text), { success: (n) => `已导入 ${n} 条规则`, onOk: onClose })}
          >
            导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
