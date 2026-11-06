"use client";

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { isMap, parseDocument, stringify } from "yaml";
import { ConfirmButton } from "@/components/confirm-button";
import { NameSelect } from "@/components/name-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useRun } from "@/components/use-run";
import type { Listener } from "@/db/schema";
import { BUILTIN_POLICIES, LISTENER_TYPES, type ListenerType } from "@/lib/types";
import { deleteListener, saveListener, setListenerEnabled } from "@/server/actions/listeners";

/** Names collected from all profiles; a listener is resolved against whichever profile uses it. */
export interface RouteCandidates {
  groups: string[];
  nodes: string[];
  subRules: string[];
}

const OPTION_HINTS: Partial<Record<ListenerType, string>> = {
  mixed: "udp: true\nusers:\n  - username: user\n    password: pass",
  socks: "udp: true",
  tproxy: "udp: true",
  tunnel: "network: [tcp, udp]\ntarget: 1.1.1.1:53",
  tun: "stack: mixed\nauto-route: true\nauto-detect-interface: true\ndns-hijack:\n  - any:53",
  shadowsocks: "cipher: 2022-blake3-aes-128-gcm\npassword: base64key==",
  vmess: "users:\n  - username: user\n    uuid: 00000000-0000-0000-0000-000000000000\n    alterId: 0",
  vless: "users:\n  - username: user\n    uuid: 00000000-0000-0000-0000-000000000000\n    flow: xtls-rprx-vision",
  trojan: "users:\n  - username: user\n    password: pass",
  tuic: "users:\n  00000000-0000-0000-0000-000000000000: pass\ncertificate: ./server.crt\nprivate-key: ./server.key",
  hysteria2: "users:\n  user: pass\ncertificate: ./server.crt\nprivate-key: ./server.key",
  anytls: "users:\n  user: pass\ncertificate: ./server.crt\nprivate-key: ./server.key",
};

export function ListenersPanel({
  listeners,
  usedBy,
  candidates,
}: {
  listeners: Listener[];
  usedBy: Record<number, string[]>;
  candidates: RouteCandidates;
}) {
  const [pending, run] = useRun();
  const [editing, setEditing] = useState<Listener | "new" | null>(null);

  const route = (l: Listener) => (l.proxy ? `代理 ${l.proxy}` : l.subRule ? `子规则 ${l.subRule}` : "主规则");

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          额外的入站端口，在配置方案的「订阅与链接」中添加后生效。指定的代理组或子规则按名称在使用它的方案中查找，方案里必须存在同名项。
        </p>
        <Button onClick={() => setEditing("new")}>
          <PlusIcon />
          添加监听器
        </Button>
      </div>
      {listeners.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">还没有监听器</div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
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
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{l.type}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{l.type === "tun" ? "—" : `${l.listen}:${l.port}`}</TableCell>
                  <TableCell className="text-muted-foreground">{route(l)}</TableCell>
                  <TableCell className="text-muted-foreground">{usedBy[l.id]?.join("、") || "—"}</TableCell>
                  <TableCell>
                    <Switch checked={l.enabled} disabled={pending} onCheckedChange={(v) => run(() => setListenerEnabled(l.id, v))} />
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
          candidates={candidates}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

type RouteMode = "rules" | "proxy" | "sub-rule";

function ListenerDialog({
  listener,
  candidates,
  onClose,
}: {
  listener: Listener | null;
  candidates: RouteCandidates;
  onClose: () => void;
}) {
  const [pending, run] = useRun();
  const [name, setName] = useState(listener?.name ?? "");
  const [type, setType] = useState<ListenerType>((listener?.type as ListenerType) ?? "mixed");
  const [listen, setListen] = useState(listener?.listen ?? "0.0.0.0");
  const [port, setPort] = useState(listener?.port?.toString() ?? "");
  const [mode, setMode] = useState<RouteMode>(listener?.proxy ? "proxy" : listener?.subRule ? "sub-rule" : "rules");
  const [proxy, setProxy] = useState(listener?.proxy ?? "");
  const [subRule, setSubRule] = useState(listener?.subRule ?? "");
  const [optionsText, setOptionsText] = useState(
    listener && Object.keys(listener.options).length ? stringify(listener.options) : "",
  );

  const submit = () => {
    let options: Record<string, unknown> = {};
    if (optionsText.trim()) {
      const doc = parseDocument(optionsText);
      if (doc.errors.length) return toast.error(`额外参数 YAML 错误：${doc.errors[0].message}`);
      if (!isMap(doc.contents)) return toast.error("额外参数必须是 YAML 映射");
      options = doc.toJS();
    }
    run(
      () =>
        saveListener({
          id: listener?.id,
          name,
          type,
          listen,
          port: type === "tun" || port === "" ? null : Number(port),
          proxy: mode === "proxy" ? proxy || null : null,
          subRule: mode === "sub-rule" ? subRule || null : null,
          options,
          enabled: listener?.enabled ?? true,
        }),
      { success: "已保存", onOk: onClose },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{listener ? `编辑监听器「${listener.name}」` : "添加监听器"}</DialogTitle>
          <DialogDescription>name、type、listen、port、proxy、rule 由表单生成，其余字段写在额外参数里。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-[1fr_10rem] gap-3">
            <div className="grid gap-1.5">
              <Label>名称</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>类型</Label>
              <Select value={type} onValueChange={(v) => setType(v as ListenerType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-80">
                  {LISTENER_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {type !== "tun" && (
            <div className="grid grid-cols-[1fr_10rem] gap-3">
              <div className="grid gap-1.5">
                <Label>监听地址</Label>
                <Input value={listen} onChange={(e) => setListen(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>端口</Label>
                <Input type="number" min={1} max={65535} value={port} onChange={(e) => setPort(e.target.value)} />
              </div>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label>流量走向</Label>
            <div className="grid grid-cols-[10rem_1fr] gap-3">
              <Select value={mode} onValueChange={(v) => setMode(v as RouteMode)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rules">按主规则</SelectItem>
                  <SelectItem value="proxy">指定代理</SelectItem>
                  <SelectItem value="sub-rule">按子规则</SelectItem>
                </SelectContent>
              </Select>
              {mode === "proxy" && (
                <NameSelect
                  value={proxy}
                  onChange={setProxy}
                  sections={[
                    { label: "代理组（各方案）", items: candidates.groups },
                    { label: "内置策略", items: [...BUILTIN_POLICIES] },
                    { label: "手动节点", items: candidates.nodes },
                  ]}
                />
              )}
              {mode === "sub-rule" && (
                <NameSelect
                  value={subRule}
                  onChange={setSubRule}
                  placeholder={candidates.subRules.length ? "选择子规则" : "请先在配置方案的「规则」中新建子规则"}
                  sections={[{ label: "子规则（各方案）", items: candidates.subRules }]}
                />
              )}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>额外参数（YAML，可选）</Label>
            <Textarea
              className="h-40 font-mono text-xs"
              value={optionsText}
              placeholder={OPTION_HINTS[type] ?? ""}
              onChange={(e) => setOptionsText(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
