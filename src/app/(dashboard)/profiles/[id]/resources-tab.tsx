"use client";

import { PlusIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SortableList } from "@/components/sortable-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { useRun } from "@/components/use-run";
import { updateProfileResources } from "@/server/actions/profiles";
import { useEditor } from "./context";
import { GroupsTab } from "./groups-tab";

export function ResourcesTab() {
  const { profile, subscriptions, manualNodes, listeners } = useEditor();
  const [pending, run] = useRun();
  const [subscriptionIds, setSubscriptionIds] = useResourceIds(profile.subscriptionIds, subscriptions);
  const [manualNodeIds, setManualNodeIds] = useResourceIds(profile.manualNodeIds, manualNodes);
  const [listenerIds, setListenerIds] = useResourceIds(profile.listenerIds, listeners);

  const save = () =>
    run(() => updateProfileResources({ id: profile.id, subscriptionIds, manualNodeIds, listenerIds }), { success: "已保存" });

  return (
    <div className="grid gap-6">
      <section className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <h2 className="text-sm font-medium">订阅、节点与监听器</h2>
            <p className="text-sm text-muted-foreground">选择写入方案的资源，拖动调整输出顺序。</p>
          </div>
          <Button onClick={save} disabled={pending}>
            保存
          </Button>
        </div>
        <div className="grid items-start gap-3 lg:grid-cols-3">
          <OrderedPicker
            label="订阅"
            empty="未选用订阅"
            items={subscriptions}
            value={subscriptionIds}
            onChange={setSubscriptionIds}
            badges={(s) => (
              <>
                <Badge variant={s.mode === "inline" ? "secondary" : "outline"}>{s.mode}</Badge>
                {!s.enabled && <Badge variant="destructive">已停用</Badge>}
              </>
            )}
          />

          <OrderedPicker
            label="手动节点"
            empty={manualNodes.length ? "未选用手动节点" : "暂无手动节点"}
            items={manualNodes}
            value={manualNodeIds}
            onChange={setManualNodeIds}
            badges={(n) => (
              <>
                <Badge variant="secondary">{n.type}</Badge>
                {!n.enabled && <Badge variant="destructive">已停用</Badge>}
              </>
            )}
          />

          <OrderedPicker
            label="监听器"
            empty={listeners.length ? "未选用监听器" : "暂无监听器"}
            items={listeners}
            value={listenerIds}
            onChange={setListenerIds}
            badges={(l) => (
              <>
                <Badge variant="secondary">{l.type}</Badge>
                {!l.enabled && <Badge variant="destructive">已停用</Badge>}
              </>
            )}
            details={(l) =>
              `${l.type === "tun" ? "" : `:${l.port} · `}${l.proxy ? `代理 ${l.proxy}` : l.subRule ? `子规则 ${l.subRule}` : "主规则"}`
            }
          />
        </div>
      </section>

      <section className="grid gap-3 border-t pt-5">
        <h2 className="text-sm font-medium">代理组</h2>
        <GroupsTab />
      </section>
    </div>
  );
}

function useResourceIds(profileIds: number[], items: { id: number }[]) {
  const profileIdsKey = profileIds.join(",");
  const availableIdsKey = items
    .map((item) => item.id)
    .sort((a, b) => a - b)
    .join(",");
  const [ids, setIds] = useState(() => profileIds.filter((id) => items.some((item) => item.id === id)));

  useEffect(() => {
    const availableIds = new Set(availableIdsKey ? availableIdsKey.split(",").map(Number) : []);
    const nextIds = (profileIdsKey ? profileIdsKey.split(",").map(Number) : []).filter((id) => availableIds.has(id));
    setIds(nextIds);
  }, [availableIdsKey, profileIdsKey]);

  return [ids, setIds] as const;
}

function OrderedPicker<T extends { id: number; name: string }>({
  label,
  empty,
  items,
  value,
  onChange,
  badges,
  details,
}: {
  label: string;
  empty: string;
  items: T[];
  value: number[];
  onChange: (ids: number[]) => void;
  badges: (item: T) => ReactNode;
  details?: (item: T) => ReactNode;
}) {
  const selected = useMemo(() => {
    const byId = new Map(items.map((item) => [item.id, item]));
    return value.flatMap((id) => {
      const item = byId.get(id);
      return item ? [item] : [];
    });
  }, [items, value]);
  const unselected = items.filter((item) => !value.includes(item.id));

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border">
      <div className="flex h-11 items-center gap-2 border-b bg-muted/30 px-3">
        <Label className="min-w-0 flex-1 truncate">{label}</Label>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {value.length} / {items.length}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={unselected.length === 0} aria-label={`添加${label}`}>
              <PlusIcon />
              添加
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-2rem)]">
            <DropdownMenuLabel>添加{label}</DropdownMenuLabel>
            {unselected.map((item) => (
              <DropdownMenuItem key={item.id} onSelect={() => onChange([...value, item.id])}>
                <PlusIcon />
                <span className="truncate">{item.name}</span>
              </DropdownMenuItem>
            ))}
            {unselected.length > 1 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onChange([...value, ...unselected.map((item) => item.id)])}>
                  全部添加
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {selected.length === 0 ? (
          <p className="px-3 py-5 text-center text-xs text-muted-foreground">{empty}</p>
        ) : (
          <SortableList
            items={selected}
            onReorder={onChange}
            className="border-0"
            renderItem={(item) => (
              <div className="flex min-w-0 items-center gap-1.5">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm" title={item.name}>
                      {item.name}
                    </span>
                    {badges(item)}
                  </div>
                  {details && <div className="truncate text-xs text-muted-foreground">{details(item)}</div>}
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`移除${item.name}`}
                  onClick={() => onChange(value.filter((id) => id !== item.id))}
                >
                  <XIcon />
                </Button>
              </div>
            )}
          />
        )}
      </div>
    </section>
  );
}
