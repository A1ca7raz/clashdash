"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useRun } from "@/components/use-run";
import type { Subscription } from "@/db/schema";
import type { ProviderOptions, SubscriptionMode } from "@/lib/types";
import { saveSubscription, type SubscriptionInput } from "@/server/actions/subscriptions";
import { PreviewTable } from "./preview-dialog";
import { ProcessingFields } from "./processing-fields";

export function SubscriptionDialog({ subscription, onClose }: { subscription: Subscription | null; onClose: () => void }) {
  const [pending, run] = useRun();
  const [form, setForm] = useState<SubscriptionInput>(() => ({
    id: subscription?.id,
    name: subscription?.name ?? "",
    url: subscription?.url ?? "",
    userAgent: subscription?.userAgent ?? "clash.meta",
    enabled: subscription?.enabled ?? true,
    mode: subscription?.mode ?? "inline",
    cacheTtl: subscription?.cacheTtl ?? 3600,
    processing: subscription?.processing ?? {},
    providerOptions: subscription?.providerOptions ?? {},
  }));
  const set = (patch: Partial<SubscriptionInput>) => setForm((f) => ({ ...f, ...patch }));
  const po = form.providerOptions as ProviderOptions;
  const setPo = (patch: Partial<ProviderOptions>) => set({ providerOptions: { ...po, ...patch } });
  const hc = po.healthCheck ?? { enable: false };

  const submit = () =>
    run(() => saveSubscription(form), {
      success: subscription ? "已保存" : "已添加，并已尝试拉取节点",
      onOk: onClose,
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{subscription ? `编辑订阅「${subscription.name}」` : "添加订阅"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <div className="grid gap-1.5">
              <Label>名称</Label>
              <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <label className="flex h-8 items-center gap-2 text-sm">
              <Switch checked={form.enabled} onCheckedChange={(enabled) => set({ enabled })} />
              启用
            </label>
          </div>
          <div className="grid gap-1.5">
            <Label>订阅地址</Label>
            <Input value={form.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>工作模式</Label>
              <Select value={form.mode} onValueChange={(mode) => set({ mode: mode as SubscriptionMode })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inline">inline：服务端合并节点</SelectItem>
                  <SelectItem value="provider">provider：客户端拉取</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>User-Agent</Label>
              <Input value={form.userAgent} onChange={(e) => set({ userAgent: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>服务端缓存（秒）</Label>
              <Input
                type="number"
                min={60}
                value={form.cacheTtl}
                onChange={(e) => set({ cacheTtl: Number(e.target.value) })}
              />
            </div>
          </div>

          {form.mode === "provider" && (
            <>
              <Separator />
              <div className="grid gap-2">
                <Label>Provider 选项</Label>
                <div className="grid grid-cols-[1fr_auto_1fr_1fr_auto] items-end gap-3">
                  <div className="grid gap-1.5">
                    <span className="text-xs text-muted-foreground">客户端更新间隔（秒）</span>
                    <Input
                      type="number"
                      value={po.interval ?? 3600}
                      onChange={(e) => setPo({ interval: Number(e.target.value) || undefined })}
                    />
                  </div>
                  <label className="flex h-8 items-center gap-2 text-sm">
                    <Switch checked={hc.enable} onCheckedChange={(enable) => setPo({ healthCheck: { ...hc, enable } })} />
                    健康检查
                  </label>
                  <div className="grid gap-1.5">
                    <span className="text-xs text-muted-foreground">检查地址</span>
                    <Input
                      disabled={!hc.enable}
                      value={hc.url ?? ""}
                      placeholder="https://www.gstatic.com/generate_204"
                      onChange={(e) => setPo({ healthCheck: { ...hc, url: e.target.value || undefined } })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <span className="text-xs text-muted-foreground">检查间隔（秒）</span>
                    <Input
                      type="number"
                      disabled={!hc.enable}
                      value={hc.interval ?? 300}
                      onChange={(e) => setPo({ healthCheck: { ...hc, interval: Number(e.target.value) || undefined } })}
                    />
                  </div>
                  <label className="flex h-8 items-center gap-2 text-sm">
                    <Switch
                      disabled={!hc.enable}
                      checked={hc.lazy ?? true}
                      onCheckedChange={(lazy) => setPo({ healthCheck: { ...hc, lazy } })}
                    />
                    lazy
                  </label>
                </div>
              </div>
            </>
          )}

          <Separator />
          <div className="grid gap-2">
            <Label>节点处理</Label>
            <ProcessingFields value={form.processing} onChange={(processing) => set({ processing })} />
          </div>

          {subscription && (
            <>
              <Separator />
              <PreviewTable subscriptionId={subscription.id} processing={form.processing} />
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
