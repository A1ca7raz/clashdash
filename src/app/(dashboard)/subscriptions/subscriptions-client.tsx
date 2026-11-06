"use client";

import { EyeIcon, PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { PageHeader } from "@/components/page-header";
import { SortableList } from "@/components/sortable-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRun } from "@/components/use-run";
import type { Subscription } from "@/db/schema";
import { formatBytes, formatDate, formatRelative } from "@/lib/format";
import { deleteSubscription, refreshSubscriptions, reorderSubscriptions } from "@/server/actions/subscriptions";
import { PreviewDialog } from "./preview-dialog";
import { SubscriptionDialog } from "./subscription-dialog";

export function SubscriptionsClient({ subscriptions }: { subscriptions: Subscription[] }) {
  const [pending, run] = useRun();
  const [editing, setEditing] = useState<Subscription | "new" | null>(null);
  const [previewing, setPreviewing] = useState<Subscription | null>(null);

  const refresh = (ids: number[] | "all") =>
    run(() => refreshSubscriptions(ids), {
      success: (results) => {
        const failed = results.filter((r) => !r.ok);
        return failed.length ? `刷新完成，${failed.length} 个失败` : `已刷新 ${results.length} 个订阅`;
      },
    });

  return (
    <>
      <PageHeader
        title="订阅"
        description="inline 模式由服务端拉取节点并写入配置；provider 模式以 proxy-provider 输出原始订阅地址，由客户端自行拉取，服务端仅预拉取节点快照用于预览。"
        actions={
          <>
            <Button variant="outline" disabled={pending || !subscriptions.length} onClick={() => refresh("all")}>
              <RefreshCwIcon className={pending ? "animate-spin" : undefined} />
              全部刷新
            </Button>
            <Button onClick={() => setEditing("new")}>
              <PlusIcon />
              添加订阅
            </Button>
          </>
        }
      />

      {subscriptions.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">还没有订阅</div>
      ) : (
        <SortableList
          items={subscriptions}
          onReorder={(ids) => run(() => reorderSubscriptions(ids))}
          renderItem={(s) => (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1">
              <div className="min-w-48 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.name}</span>
                  <Badge variant={s.mode === "inline" ? "secondary" : "outline"}>{s.mode}</Badge>
                  {!s.enabled && <Badge variant="destructive">已停用</Badge>}
                </div>
                <div className="mt-0.5 max-w-xl truncate text-xs text-muted-foreground">{s.url}</div>
              </div>
              <Usage sub={s} />
              <div className="w-40 text-xs">
                <div>
                  {s.nodeCount} 个节点 · {formatRelative(s.lastFetchedAt)}
                </div>
                {s.lastError && (
                  <div className="truncate text-destructive" title={s.lastError}>
                    {s.lastError}
                  </div>
                )}
              </div>
              <div className="flex items-center">
                <Button variant="ghost" size="icon-sm" title="刷新" disabled={pending} onClick={() => refresh([s.id])}>
                  <RefreshCwIcon />
                </Button>
                <Button variant="ghost" size="icon-sm" title="预览节点" onClick={() => setPreviewing(s)}>
                  <EyeIcon />
                </Button>
                <Button variant="ghost" size="icon-sm" title="编辑" onClick={() => setEditing(s)}>
                  <PencilIcon />
                </Button>
                <ConfirmButton
                  title={`删除订阅「${s.name}」？`}
                  description="节点快照会一并删除，配置方案和代理组中对它的引用也会移除。"
                  onConfirm={() => run(() => deleteSubscription(s.id), { success: "已删除" })}
                >
                  <Trash2Icon />
                </ConfirmButton>
              </div>
            </div>
          )}
        />
      )}

      {editing && (
        <SubscriptionDialog
          key={editing === "new" ? "new" : editing.id}
          subscription={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {previewing && <PreviewDialog subscription={previewing} onClose={() => setPreviewing(null)} />}
    </>
  );
}

function Usage({ sub }: { sub: Subscription }) {
  const info = sub.userinfo;
  if (!info || !info.total) return <div className="w-44 text-xs text-muted-foreground">无流量信息</div>;
  const used = info.upload + info.download;
  const pct = Math.min(100, (used / info.total) * 100);
  return (
    <div className="w-44 text-xs">
      <div className="flex justify-between">
        <span>
          {formatBytes(used)} / {formatBytes(info.total)}
        </span>
        {info.expire && <span className="text-muted-foreground">{formatDate(info.expire)}</span>}
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={pct > 90 ? "h-full bg-destructive" : "h-full bg-primary"} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
