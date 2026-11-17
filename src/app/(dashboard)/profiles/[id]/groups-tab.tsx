"use client";

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { SortableList } from "@/components/sortable-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRun } from "@/components/use-run";
import type { ProxyGroup } from "@/db/schema";
import { deleteGroup, reorder } from "@/server/actions/profiles";
import { useEditor } from "./context";
import { GroupDialog } from "./group-dialog";

export function GroupsTab() {
  const { profile, groups, subscriptions } = useEditor();
  const [, run] = useRun();
  const [editing, setEditing] = useState<ProxyGroup | "new" | null>(null);
  const subName = new Map(subscriptions.map((s) => [s.id, s.name]));

  const summary = (g: ProxyGroup) => {
    const m = g.members;
    const parts: string[] = [];
    if (m.items.length) parts.push(m.items.join("、"));
    const sources = m.sources.all ? ["全部订阅"] : m.sources.subscriptions.map((id) => subName.get(id) ?? `#${id}`);
    if (m.sources.manual) sources.push("手动节点");
    if (sources.length) parts.push(`来源：${sources.join("、")}`);
    if (m.include) parts.push(`包含 ${m.include}`);
    if (m.exclude) parts.push(`排除 ${m.exclude}`);
    return parts.join(" · ") || "无成员";
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">拖动调整输出顺序。改名会同步更新引用；共享监听器会为当前方案创建副本。</p>
        <Button onClick={() => setEditing("new")}>
          <PlusIcon />
          添加代理组
        </Button>
      </div>
      {groups.length === 0 ? (
        <div className="py-8 text-sm text-muted-foreground">还没有代理组</div>
      ) : (
        <SortableList
          items={groups}
          className="overflow-hidden rounded-lg border"
          onReorder={(ids) => run(() => reorder("groups", profile.id, ids))}
          renderItem={(g) => (
            <div className="flex items-center gap-3">
              <span className="shrink-0 font-medium">{g.name}</span>
              <Badge variant="secondary">{g.type}</Badge>
              {g.options.hidden && <Badge variant="outline">hidden</Badge>}
              <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{summary(g)}</div>
              <Button variant="ghost" size="icon-sm" onClick={() => setEditing(g)}>
                <PencilIcon />
              </Button>
              <ConfirmButton title={`删除代理组「${g.name}」？`} onConfirm={() => run(() => deleteGroup(g.id), { success: "已删除" })}>
                <Trash2Icon />
              </ConfirmButton>
            </div>
          )}
        />
      )}
      {editing && (
        <GroupDialog key={editing === "new" ? "new" : editing.id} group={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
