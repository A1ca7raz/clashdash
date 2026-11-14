"use client";

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { stringify } from "yaml";
import { BatchManagementControls, BatchSelectionCheckbox, useBatchManagement } from "@/components/batch-management";
import { ConfirmButton } from "@/components/confirm-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useRun } from "@/components/use-run";
import { YamlEditor } from "@/components/yaml-editor";
import type { Node } from "@/db/schema";
import { parseManualNodeConfig } from "@/lib/node-config";
import type { YamlPointerDefinition } from "@/lib/yaml-pointer";
import {
  createManualNode,
  deleteManualNode,
  deleteManualNodes,
  importManualNodes,
  setManualNodeEnabled,
  updateManualNode,
} from "@/server/actions/nodes";

export function ManualNodesPanel({
  nodes,
  usedBy,
  pointers,
}: {
  nodes: Node[];
  usedBy: Record<number, string[]>;
  pointers: YamlPointerDefinition[];
}) {
  const [pending, run] = useRun();
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<Node | "new" | null>(null);
  const batch = useBatchManagement(nodes.map((node) => node.id));
  const remove = () =>
    run(() => deleteManualNodes([...batch.selectedIds]), {
      success: (count) => `已删除 ${count} 个节点`,
      onOk: batch.clear,
    });

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          不属于任何订阅的节点，在配置方案的「节点与代理组」中添加后写入 proxies，代理组可通过来源「手动节点」引用。
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => setImporting(true)}>
            <PlusIcon />
            导入节点
          </Button>
          <Button onClick={() => setEditing("new")}>
            <PlusIcon />
            添加节点
          </Button>
        </div>
      </div>
      <BatchManagementControls
        batch={batch}
        totalCount={nodes.length}
        pending={pending}
        deleteDescription="将删除所选手动节点及其与配置方案的关联，不会删除订阅节点快照。"
        onDelete={remove}
      />
      {nodes.length === 0 ? (
        <div className="py-8 text-sm text-muted-foreground">还没有手动节点</div>
      ) : (
        <div className="border-y">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"><span className="sr-only">选择</span></TableHead>
                <TableHead>名称</TableHead>
                <TableHead className="w-28">类型</TableHead>
                <TableHead>服务器</TableHead>
                <TableHead>使用的方案</TableHead>
                <TableHead className="w-20">启用</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {nodes.map((n) => (
                <TableRow key={n.id} data-state={batch.selectedIds.has(n.id) ? "selected" : undefined}>
                  <TableCell>
                    <BatchSelectionCheckbox
                      label={`选择节点「${n.name}」`}
                      checked={batch.selectedIds.has(n.id)}
                      disabled={pending}
                      onToggle={() => batch.toggle(n.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{n.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{n.type}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {String(n.config.server ?? "")}:{String(n.config.port ?? "")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{usedBy[n.id]?.join("、") || "—"}</TableCell>
                  <TableCell>
                    <Switch
                      checked={n.enabled}
                      disabled={pending}
                      onCheckedChange={(v) => run(() => setManualNodeEnabled(n.id, v))}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(n)}>
                      <PencilIcon />
                    </Button>
                    <ConfirmButton
                      title={`删除节点「${n.name}」？`}
                      onConfirm={() => run(() => deleteManualNode(n.id), { success: "已删除" })}
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
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
      {editing && (
        <NodeDialog
          key={editing === "new" ? "new" : editing.id}
          node={editing === "new" ? null : editing}
          pointers={pointers}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const [pending, run] = useRun();
  const [text, setText] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>导入节点</DialogTitle>
          <DialogDescription>
            每行一个分享链接（ss / ssr / vmess / vless / trojan / hysteria2 / tuic / wireguard / anytls），或粘贴包含 proxies 的 Clash YAML、Base64 订阅内容。
          </DialogDescription>
        </DialogHeader>
        <Textarea className="h-64 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={pending || !text.trim()}
            onClick={() =>
              run(() => importManualNodes(text), {
                success: (r) => `已导入 ${r.added} 个节点${r.errors.length ? `，${r.errors.length} 行无法解析` : ""}`,
                onOk: onClose,
              })
            }
          >
            导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const NEW_NODE_TEMPLATE = `name: 我的节点
type: ss
server: example.com
port: 443
cipher: aes-128-gcm
password: your-password
`;

function NodeDialog({
  node,
  pointers,
  onClose,
}: {
  node: Node | null;
  pointers: YamlPointerDefinition[];
  onClose: () => void;
}) {
  const [pending, run] = useRun();
  const [text, setText] = useState(() => (node ? (node.yaml ?? stringify(node.config)) : NEW_NODE_TEMPLATE));

  const submit = () => {
    try {
      parseManualNodeConfig(text, pointers);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return;
    }
    run(() => (node ? updateManualNode(node.id, text) : createManualNode(text)), {
      success: node ? "已保存" : "已添加",
      onOk: onClose,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{node ? `编辑节点「${node.name}」` : "添加节点"}</DialogTitle>
          <DialogDescription>mihomo 节点配置（YAML）。</DialogDescription>
        </DialogHeader>
        <YamlEditor value={text} onChange={setText} height="360px" />
        <DialogFooter>
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
