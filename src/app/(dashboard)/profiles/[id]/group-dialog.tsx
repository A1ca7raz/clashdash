"use client";

import { ArrowDownIcon, ArrowUpIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useRun } from "@/components/use-run";
import type { ProxyGroup } from "@/db/schema";
import { matchGroupFilter } from "@/lib/processing";
import { validateFilter } from "@/lib/regex";
import { GROUP_TYPES, type GroupMembers, type GroupOptions, type GroupType } from "@/lib/types";
import { saveGroup } from "@/server/actions/profiles";
import { useEditor } from "./context";
import { PolicySelect } from "./policy-select";

export function GroupDialog({ group, onClose }: { group: ProxyGroup | null; onClose: () => void }) {
  const { profile, subscriptions, sourceNames } = useEditor();
  const [pending, run] = useRun();
  const [name, setName] = useState(group?.name ?? "");
  const [type, setType] = useState<GroupType>(group?.type ?? "select");
  const [options, setOptions] = useState<GroupOptions>(group?.options ?? {});
  const [members, setMembers] = useState<GroupMembers>(
    group?.members ?? { items: [], sources: { all: true, subscriptions: [], manual: true } },
  );
  const setOpt = (patch: Partial<GroupOptions>) => setOptions((o) => ({ ...o, ...patch }));
  const setSources = (patch: Partial<GroupMembers["sources"]>) =>
    setMembers((m) => ({ ...m, sources: { ...m.sources, ...patch } }));

  const selectedSubs = subscriptions.filter((s) => profile.subscriptionIds.includes(s.id));
  const needsTest = type === "url-test" || type === "fallback" || type === "load-balance";

  const preview = useMemo(() => {
    const err = (members.include && validateFilter(members.include)) || (members.exclude && validateFilter(members.exclude));
    if (err) return { error: err };
    const subs = members.sources.all ? selectedSubs : selectedSubs.filter((s) => members.sources.subscriptions.includes(s.id));
    const inline = [
      ...subs.filter((s) => s.mode === "inline").flatMap((s) => sourceNames[s.id] ?? []),
      ...(members.sources.manual ? sourceNames.manual ?? [] : []),
    ];
    const expanded = matchGroupFilter(inline, members.include, members.exclude).filter((n) => !members.items.includes(n));
    const providers = subs
      .filter((s) => s.mode === "provider")
      .map((s) => {
        const snap = sourceNames[s.id];
        return { name: s.name, count: snap ? matchGroupFilter(snap, members.include, members.exclude).length : null };
      });
    return { expanded, providers };
  }, [members, selectedSubs, sourceNames]);

  const moveItem = (i: number, d: -1 | 1) => {
    const items = [...members.items];
    [items[i], items[i + d]] = [items[i + d], items[i]];
    setMembers({ ...members, items });
  };

  const submit = () =>
    run(() => saveGroup({ id: group?.id, profileId: profile.id, name, type, options, members }), {
      success: "已保存",
      onOk: onClose,
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{group ? `编辑代理组「${group.name}」` : "添加代理组"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-[1fr_12rem] gap-3">
            <div className="grid gap-1.5">
              <Label>名称</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>类型</Label>
              <Select value={type} onValueChange={(v) => setType(v as GroupType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROUP_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-2 grid gap-1.5">
              <Label>测试地址{needsTest ? "" : "（可选）"}</Label>
              <Input
                value={options.url ?? ""}
                placeholder="https://www.gstatic.com/generate_204"
                onChange={(e) => setOpt({ url: e.target.value || undefined })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>间隔（秒）</Label>
              <Input
                type="number"
                value={options.interval ?? ""}
                placeholder="300"
                onChange={(e) => setOpt({ interval: Number(e.target.value) || undefined })}
              />
            </div>
            {type === "url-test" && (
              <div className="grid gap-1.5">
                <Label>容差（ms）</Label>
                <Input
                  type="number"
                  value={options.tolerance ?? ""}
                  placeholder="50"
                  onChange={(e) => setOpt({ tolerance: e.target.value === "" ? undefined : Number(e.target.value) })}
                />
              </div>
            )}
            {type === "load-balance" && (
              <div className="grid gap-1.5">
                <Label>策略</Label>
                <Select
                  value={options.strategy ?? "consistent-hashing"}
                  onValueChange={(v) => setOpt({ strategy: v as GroupOptions["strategy"] })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consistent-hashing">consistent-hashing</SelectItem>
                    <SelectItem value="round-robin">round-robin</SelectItem>
                    <SelectItem value="sticky-sessions">sticky-sessions</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <label className="flex items-center gap-2">
              <Switch checked={options.lazy ?? true} onCheckedChange={(lazy) => setOpt({ lazy })} />
              lazy
            </label>
            <label className="flex items-center gap-2">
              <Switch checked={!!options.hidden} onCheckedChange={(hidden) => setOpt({ hidden })} />
              在面板中隐藏
            </label>
            <label className="flex items-center gap-2">
              <Switch checked={!!options.disableUdp} onCheckedChange={(disableUdp) => setOpt({ disableUdp })} />
              禁用 UDP
            </label>
            <div className="flex flex-1 items-center gap-2">
              <span className="whitespace-nowrap">图标</span>
              <Input value={options.icon ?? ""} placeholder="图标 URL（可选）" onChange={(e) => setOpt({ icon: e.target.value || undefined })} />
            </div>
          </div>

          <Separator />

          <div className="grid gap-2">
            <Label>显式成员（按顺序排在最前）</Label>
            <div className="divide-y rounded-lg border empty:hidden">
              {members.items.map((item, i) => (
                <div key={item} className="flex items-center gap-2 px-3 py-1 text-sm">
                  <span className="flex-1">{item}</span>
                  <Button variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => moveItem(i, -1)}>
                    <ArrowUpIcon />
                  </Button>
                  <Button variant="ghost" size="icon-sm" disabled={i === members.items.length - 1} onClick={() => moveItem(i, 1)}>
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setMembers({ ...members, items: members.items.filter((x) => x !== item) })}
                  >
                    <XIcon />
                  </Button>
                </div>
              ))}
            </div>
            <PolicySelect
              key={members.items.length}
              value=""
              placeholder="添加代理组、内置策略或节点…"
              exclude={[...members.items, name]}
              onChange={(v) => setMembers({ ...members, items: [...members.items, v] })}
            />
          </div>

          <div className="grid gap-2">
            <Label>节点来源</Label>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <label className="flex items-center gap-2">
                <Checkbox checked={members.sources.all} onCheckedChange={(v) => setSources({ all: v === true })} />
                方案选用的全部订阅
              </label>
              {!members.sources.all &&
                selectedSubs.map((s) => (
                  <label key={s.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={members.sources.subscriptions.includes(s.id)}
                      onCheckedChange={(v) =>
                        setSources({
                          subscriptions: v
                            ? [...members.sources.subscriptions, s.id]
                            : members.sources.subscriptions.filter((x) => x !== s.id),
                        })
                      }
                    />
                    {s.name}
                    <Badge variant={s.mode === "inline" ? "secondary" : "outline"}>{s.mode}</Badge>
                  </label>
                ))}
              <label className="flex items-center gap-2">
                <Checkbox checked={members.sources.manual} onCheckedChange={(v) => setSources({ manual: v === true })} />
                本方案添加的手动节点
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                value={members.include ?? ""}
                placeholder="包含过滤（正则，按处理后的名称）"
                onChange={(e) => setMembers({ ...members, include: e.target.value || undefined })}
              />
              <Input
                value={members.exclude ?? ""}
                placeholder="排除过滤（正则）"
                onChange={(e) => setMembers({ ...members, exclude: e.target.value || undefined })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              inline 节点在服务端按过滤条件展开为具体名称；provider 订阅输出为 use，过滤条件作为该组的 filter / exclude-filter 由客户端执行。
              注意：mihomo 的 exclude-filter 对显式成员同样生效。
            </p>
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-xs">
            {"error" in preview ? (
              <span className="text-destructive">{preview.error}</span>
            ) : (
              <div className="grid gap-1">
                <div>
                  展开的节点（{preview.expanded.length}）：
                  <span className="text-muted-foreground">{preview.expanded.slice(0, 30).join("、") || "无"}</span>
                  {preview.expanded.length > 30 && " …"}
                </div>
                {preview.providers.map((p) => (
                  <div key={p.name}>
                    provider「{p.name}」：{p.count === null ? "无节点快照，无法预估" : `按快照匹配 ${p.count} 个节点`}
                  </div>
                ))}
              </div>
            )}
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
