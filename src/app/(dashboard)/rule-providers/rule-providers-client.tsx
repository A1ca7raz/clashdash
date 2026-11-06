"use client";

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRun } from "@/components/use-run";
import type { RuleProvider } from "@/db/schema";
import { RULE_PROVIDER_BEHAVIORS, RULE_PROVIDER_FORMATS } from "@/lib/types";
import { deleteRuleProvider, saveRuleProvider, type RuleProviderInput } from "@/server/actions/rule-providers";

export function RuleProvidersClient({ providers, usage }: { providers: RuleProvider[]; usage: Record<string, number> }) {
  const [, run] = useRun();
  const [editing, setEditing] = useState<RuleProvider | "new" | null>(null);

  return (
    <>
      <PageHeader
        title="规则集"
        description="全局共享的 rule-providers。在规则中以 RULE-SET 引用；生成配置时只输出被引用的规则集。"
        actions={
          <Button onClick={() => setEditing("new")}>
            <PlusIcon />
            添加规则集
          </Button>
        }
      />
      {providers.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">还没有规则集</div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead className="w-32">类型 / 格式</TableHead>
                <TableHead>地址</TableHead>
                <TableHead className="w-20">引用</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{p.behavior}</Badge> <Badge variant="outline">{p.format}</Badge>
                  </TableCell>
                  <TableCell className="max-w-md truncate text-xs text-muted-foreground">{p.url}</TableCell>
                  <TableCell>{usage[p.name] ?? 0}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(p)}>
                      <PencilIcon />
                    </Button>
                    <ConfirmButton title={`删除规则集「${p.name}」？`} onConfirm={() => run(() => deleteRuleProvider(p.id), { success: "已删除" })}>
                      <Trash2Icon />
                    </ConfirmButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {editing && (
        <ProviderDialog provider={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function ProviderDialog({ provider, onClose }: { provider: RuleProvider | null; onClose: () => void }) {
  const [pending, run] = useRun();
  const [form, setForm] = useState<RuleProviderInput>({
    id: provider?.id,
    name: provider?.name ?? "",
    behavior: (provider?.behavior as RuleProviderInput["behavior"]) ?? "domain",
    format: (provider?.format as RuleProviderInput["format"]) ?? "mrs",
    url: provider?.url ?? "",
    interval: provider?.interval ?? 86400,
  });
  const set = (patch: Partial<RuleProviderInput>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{provider ? "编辑规则集" : "添加规则集"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>名称</Label>
            <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
            {provider && <p className="text-xs text-muted-foreground">改名会同步更新所有引用它的规则。</p>}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>类型</Label>
              <Select value={form.behavior} onValueChange={(behavior) => set({ behavior: behavior as RuleProviderInput["behavior"] })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_PROVIDER_BEHAVIORS.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>格式</Label>
              <Select value={form.format} onValueChange={(format) => set({ format: format as RuleProviderInput["format"] })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_PROVIDER_FORMATS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>更新间隔（秒）</Label>
              <Input type="number" value={form.interval} onChange={(e) => set({ interval: Number(e.target.value) })} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>地址</Label>
            <Input value={form.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button disabled={pending} onClick={() => run(() => saveRuleProvider(form), { success: "已保存", onOk: onClose })}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
