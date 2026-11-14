"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useRun } from "@/components/use-run";
import { YamlEditor } from "@/components/yaml-editor";
import type { Subscription } from "@/db/schema";
import {
  formatSubscriptionConfigError,
  NEW_PROVIDER_TEMPLATE,
  parseProviderSubscription,
  providerSubscriptionToYaml,
} from "@/lib/subscription-config";
import type { Processing, ProviderOptions, SubscriptionMode } from "@/lib/types";
import type { YamlPointerDefinition } from "@/lib/yaml-pointer";
import { saveProviderSubscription, saveSubscription } from "@/server/actions/subscriptions";
import { PreviewTable } from "./preview-dialog";
import { ProcessingFields } from "./processing-fields";

interface SubscriptionForm {
  id?: number;
  name: string;
  url: string;
  userAgent: string;
  enabled: boolean;
  mode: SubscriptionMode;
  cacheTtl: number;
  processing: Processing;
  providerOptions: ProviderOptions;
}

export function SubscriptionDialog({
  subscription,
  pointers,
  onClose,
}: {
  subscription: Subscription | null;
  pointers: YamlPointerDefinition[];
  onClose: () => void;
}) {
  const [pending, run] = useRun();
  const [form, setForm] = useState<SubscriptionForm>(() => ({
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
  const [text, setText] = useState(() =>
    subscription ? (subscription.yaml ?? providerSubscriptionToYaml(subscription)) : NEW_PROVIDER_TEMPLATE,
  );
  const set = (patch: Partial<SubscriptionForm>) => setForm((f) => ({ ...f, ...patch }));

  const parsed = useMemo(() => {
    try {
      return { config: parseProviderSubscription(text, pointers) };
    } catch (err) {
      return { error: formatSubscriptionConfigError(err) };
    }
  }, [text, pointers]);

  const changeMode = (mode: SubscriptionMode) => {
    if (mode === form.mode) return;
    if (mode === "provider") {
      setText(!subscription && !form.name && !form.url ? NEW_PROVIDER_TEMPLATE : providerSubscriptionToYaml({ ...form, mode }));
      set({ mode });
      return;
    }
    if (!parsed.config) return;
    setForm((f) => ({ ...f, ...parsed.config, mode }));
  };

  const submit = () =>
    run(() => (form.mode === "provider" ? saveProviderSubscription(text, form.id) : saveSubscription(form)), {
      success: subscription ? "已保存" : "已添加，并已尝试拉取节点",
      onOk: onClose,
    });

  const canPreview = form.mode === "inline" || !!parsed.config;
  const processing = form.mode === "provider" ? (parsed.config?.processing ?? form.processing) : form.processing;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{subscription ? `编辑订阅「${subscription.name}」` : "添加订阅"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>工作模式</Label>
            <Select value={form.mode} onValueChange={(mode) => changeMode(mode as SubscriptionMode)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inline">inline：服务端合并节点（表单）</SelectItem>
                <SelectItem value="provider">provider：客户端拉取（YAML）</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.mode === "provider" ? (
            <div className="grid gap-2">
              <YamlEditor value={text} onChange={setText} height="440px" />
              {!parsed.config && <p className="text-xs text-destructive">{parsed.error}</p>}
            </div>
          ) : (
            <>
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
              <div className="grid grid-cols-2 gap-3">
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

              <Separator />
              <div className="grid gap-2">
                <Label>节点处理</Label>
                <ProcessingFields value={form.processing} onChange={(processing) => set({ processing })} />
              </div>
            </>
          )}

          {subscription && canPreview && (
            <>
              <Separator />
              <PreviewTable subscriptionId={subscription.id} processing={processing} />
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={submit} disabled={pending || (form.mode === "provider" && !parsed.config)}>
            {pending ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
