"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRun } from "@/components/use-run";
import type { Subscription } from "@/db/schema";
import { formatDateTime } from "@/lib/format";
import type { Processing } from "@/lib/types";
import { previewSubscription, type PreviewRow } from "@/server/actions/subscriptions";

export function PreviewDialog({ subscription, onClose }: { subscription: Subscription; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>节点预览：{subscription.name}</DialogTitle>
        </DialogHeader>
        <PreviewTable subscriptionId={subscription.id} autoLoad />
      </DialogContent>
    </Dialog>
  );
}

/** Shows the latest snapshot before and after processing; `processing` previews unsaved settings. */
export function PreviewTable({
  subscriptionId,
  processing,
  autoLoad,
}: {
  subscriptionId: number;
  processing?: Processing;
  autoLoad?: boolean;
}) {
  const [pending, run] = useRun();
  const [data, setData] = useState<{ rows: PreviewRow[]; lastFetchedAt: string | null } | null>(null);

  const load = () => run(() => previewSubscription(subscriptionId, processing), { onOk: setData });
  useEffect(() => {
    if (autoLoad) run(() => previewSubscription(subscriptionId), { onOk: setData });
  }, [autoLoad, run, subscriptionId]);

  const kept = data?.rows.filter((r) => r.name !== null).length ?? 0;

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <div className="text-sm">
          {data ? (
            <>
              快照共 {data.rows.length} 个节点，处理后保留 {kept} 个
              <span className="ml-2 text-xs text-muted-foreground">快照时间：{formatDateTime(data.lastFetchedAt)}</span>
            </>
          ) : (
            <span className="text-muted-foreground">按当前设置预览处理结果</span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={pending}>
          {pending ? "加载中…" : data ? "重新预览" : "预览"}
        </Button>
      </div>
      {data && (
        <div className="max-h-80 overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>原始名称</TableHead>
                <TableHead>处理后</TableHead>
                <TableHead className="w-24">类型</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r, i) => (
                <TableRow key={i} className={r.name === null ? "text-muted-foreground" : undefined}>
                  <TableCell className={r.name === null ? "line-through" : undefined}>{r.originalName}</TableCell>
                  <TableCell>{r.name ?? "已过滤"}</TableCell>
                  <TableCell>{r.type}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
