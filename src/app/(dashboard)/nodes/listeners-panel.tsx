"use client";

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BatchManagementControls, BatchSelectionCheckbox, useBatchManagement } from "@/components/batch-management";
import { ConfirmButton } from "@/components/confirm-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRun } from "@/components/use-run";
import { YamlEditor } from "@/components/yaml-editor";
import type { Listener } from "@/db/schema";
import { formatListenerConfigError, listenerToYaml, NEW_LISTENER_TEMPLATE, parseListenerConfig } from "@/lib/listener-config";
import type { YamlPointerDefinition } from "@/lib/yaml-pointer";
import { deleteListener, deleteListeners, saveListener, setListenerEnabled } from "@/server/actions/listeners";

export function ListenersPanel({
  listeners,
  usedBy,
  pointers,
}: {
  listeners: Listener[];
  usedBy: Record<number, string[]>;
  pointers: YamlPointerDefinition[];
}) {
  const [pending, run] = useRun();
  const [editing, setEditing] = useState<Listener | "new" | null>(null);
  const batch = useBatchManagement(listeners.map((listener) => listener.id));
  const remove = () =>
    run(() => deleteListeners([...batch.selectedIds]), {
      success: (count) => `已删除 ${count} 个监听器`,
      onOk: batch.clear,
    });

  const route = (l: Listener) => (l.proxy ? `代理 ${l.proxy}` : l.subRule ? `子规则 ${l.subRule}` : "主规则");

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          额外的入站端口，在配置方案的「节点与代理组」中添加后生效。指定的代理组或子规则按名称在使用它的方案中查找，方案里必须存在同名项。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setEditing("new")}>
            <PlusIcon />
            添加监听器
          </Button>
        </div>
      </div>
      <BatchManagementControls
        batch={batch}
        totalCount={listeners.length}
        pending={pending}
        deleteDescription="将删除所选监听器，并通过外键级联删除配置方案中的监听器关联。"
        onDelete={remove}
      />
      {listeners.length === 0 ? (
        <div className="py-8 text-sm text-muted-foreground">还没有监听器</div>
      ) : (
        <div className="border-y">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"><span className="sr-only">选择</span></TableHead>
                <TableHead>名称</TableHead>
                <TableHead className="w-28">类型</TableHead>
                <TableHead>监听</TableHead>
                <TableHead>流量走向</TableHead>
                <TableHead>使用的方案</TableHead>
                <TableHead className="w-20">启用</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {listeners.map((l) => (
                <TableRow key={l.id} data-state={batch.selectedIds.has(l.id) ? "selected" : undefined}>
                  <TableCell>
                    <BatchSelectionCheckbox
                      label={`选择监听器「${l.name}」`}
                      checked={batch.selectedIds.has(l.id)}
                      disabled={pending}
                      onToggle={() => batch.toggle(l.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{l.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{l.type}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{l.type === "tun" ? "—" : `${l.listen}:${l.port}`}</TableCell>
                  <TableCell className="text-muted-foreground">{route(l)}</TableCell>
                  <TableCell className="text-muted-foreground">{usedBy[l.id]?.join("、") || "—"}</TableCell>
                  <TableCell>
                    <Switch
                      checked={l.enabled}
                      disabled={pending}
                      onCheckedChange={(v) => run(() => setListenerEnabled(l.id, v))}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(l)}>
                      <PencilIcon />
                    </Button>
                    <ConfirmButton
                      title={`删除监听器「${l.name}」？`}
                      description={usedBy[l.id]?.length ? `会同时从 ${usedBy[l.id].join("、")} 中移除。` : undefined}
                      onConfirm={() => run(() => deleteListener(l.id), { success: "已删除" })}
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
        <ListenerDialog
          key={editing === "new" ? "new" : editing.id}
          listener={editing === "new" ? null : editing}
          pointers={pointers}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ListenerDialog({
  listener,
  pointers,
  onClose,
}: {
  listener: Listener | null;
  pointers: YamlPointerDefinition[];
  onClose: () => void;
}) {
  const [pending, run] = useRun();
  const [text, setText] = useState(() => (listener ? (listener.yaml ?? listenerToYaml(listener)) : NEW_LISTENER_TEMPLATE));

  const submit = () => {
    try {
      parseListenerConfig(text, pointers);
    } catch (err) {
      toast.error(formatListenerConfigError(err));
      return;
    }
    run(() => saveListener(text, listener?.id), { success: "已保存", onOk: onClose });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{listener ? `编辑监听器「${listener.name}」` : "添加监听器"}</DialogTitle>
          <DialogDescription>使用 mihomo 原生监听器字段；rule 表示子规则，其他扩展字段会直接保留。</DialogDescription>
        </DialogHeader>
        <YamlEditor value={text} onChange={setText} height="420px" onSubmit={() => !pending && submit()} />
        <DialogFooter>
          <p className="text-xs text-muted-foreground sm:mr-auto">按 Alt+Enter 保存</p>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={submit} disabled={pending}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
