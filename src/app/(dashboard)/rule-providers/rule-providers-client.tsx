"use client";

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BatchManagementControls, BatchSelectionCheckbox, useBatchManagement } from "@/components/batch-management";
import { ConfirmButton } from "@/components/confirm-button";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRun } from "@/components/use-run";
import { YamlEditor } from "@/components/yaml-editor";
import type { RuleProvider } from "@/db/schema";
import {
  formatRuleProviderConfigError,
  NEW_RULE_PROVIDER_TEMPLATE,
  parseRuleProviderConfig,
  ruleProviderToYaml,
} from "@/lib/rule-provider-config";
import type { YamlPointerDefinition } from "@/lib/yaml-pointer";
import { deleteRuleProvider, deleteRuleProviders, saveRuleProvider } from "@/server/actions/rule-providers";

export function RuleProvidersClient({
  providers,
  usage,
  pointers,
}: {
  providers: RuleProvider[];
  usage: Record<string, number>;
  pointers: YamlPointerDefinition[];
}) {
  const [pending, run] = useRun();
  const [editing, setEditing] = useState<RuleProvider | "new" | null>(null);
  const batch = useBatchManagement(providers.map((provider) => provider.id));
  const remove = () =>
    run(() => deleteRuleProviders([...batch.selectedIds]), {
      success: (count) => `已删除 ${count} 个规则集`,
      onOk: batch.clear,
    });
  const references = providers
    .filter((provider) => batch.selectedIds.has(provider.id) && usage[provider.name])
    .map((provider) => `「${provider.name}」被 ${usage[provider.name]} 条规则引用`);

  return (
    <>
      <PageHeader
        title="规则集"
        description="全局共享的 rule-providers，支持 HTTP 和 inline。在规则中以 RULE-SET 引用；生成配置时只输出被引用的规则集。"
        actions={
          <Button onClick={() => setEditing("new")}>
            <PlusIcon />
            添加规则集
          </Button>
        }
      />
      <div className="mb-4">
        <BatchManagementControls
          batch={batch}
          totalCount={providers.length}
          pending={pending}
          deleteDescription={`${references.length ? `当前${references.join("、")}。` : ""}若任一规则集仍被 RULE-SET 规则引用，整批删除会失败并回滚；服务端会重新检查引用。`}
          onDelete={remove}
        />
      </div>
      {providers.length === 0 ? (
        <div className="py-8 text-sm text-muted-foreground">还没有规则集</div>
      ) : (
        <div className="border-y">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"><span className="sr-only">选择</span></TableHead>
                <TableHead>名称</TableHead>
                <TableHead className="w-52">类型 / 行为 / 格式</TableHead>
                <TableHead>地址 / 内容</TableHead>
                <TableHead className="w-20">引用</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((p) => (
                <TableRow key={p.id} data-state={batch.selectedIds.has(p.id) ? "selected" : undefined}>
                  <TableCell>
                    <BatchSelectionCheckbox
                      label={`选择规则集「${p.name}」`}
                      checked={batch.selectedIds.has(p.id)}
                      disabled={pending}
                      onToggle={() => batch.toggle(p.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{p.type}</Badge> <Badge variant="outline">{p.behavior}</Badge>{" "}
                    {p.type === "http" && <Badge variant="outline">{p.format}</Badge>}
                  </TableCell>
                  <TableCell className="max-w-md truncate text-xs text-muted-foreground">
                    {p.type === "inline" ? `${p.payload.length} 条内置规则` : p.url}
                  </TableCell>
                  <TableCell>{usage[p.name] ?? 0}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(p)}>
                      <PencilIcon />
                    </Button>
                    <ConfirmButton
                      title={`删除规则集「${p.name}」？`}
                      onConfirm={() => run(() => deleteRuleProvider(p.id), { success: "已删除" })}
                    >
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
        <ProviderDialog provider={editing === "new" ? null : editing} pointers={pointers} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function ProviderDialog({
  provider,
  pointers,
  onClose,
}: {
  provider: RuleProvider | null;
  pointers: YamlPointerDefinition[];
  onClose: () => void;
}) {
  const [pending, run] = useRun();
  const [text, setText] = useState(() => (provider ? (provider.yaml ?? ruleProviderToYaml(provider)) : NEW_RULE_PROVIDER_TEMPLATE));

  const submit = () => {
    try {
      parseRuleProviderConfig(text, pointers);
    } catch (err) {
      toast.error(formatRuleProviderConfigError(err));
      return;
    }
    run(() => saveRuleProvider(text, provider?.id), { success: "已保存", onOk: onClose });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{provider ? `编辑规则集「${provider.name}」` : "添加规则集"}</DialogTitle>
          <DialogDescription>
            使用 mihomo 原生 rule-provider 字段；inline 类型通过 payload 编写规则。{provider ? "改名会同步更新所有引用它的规则。" : ""}
          </DialogDescription>
        </DialogHeader>
        <YamlEditor value={text} onChange={setText} height="420px" onSubmit={() => !pending && submit()} />
        <DialogFooter>
          <p className="text-xs text-muted-foreground sm:mr-auto">按 Alt+Enter 保存</p>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button disabled={pending} onClick={submit}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
