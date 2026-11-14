"use client";

import { ExternalLinkIcon, QrCodeIcon, RotateCcwIcon } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { MaskedSubscriptionLink } from "@/components/masked-subscription-link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRun } from "@/components/use-run";
import { resetProfileToken, updateProfileSettings } from "@/server/actions/profiles";
import { useEditor } from "./context";
import { PreviewTab } from "./preview-tab";

export function SettingsTab() {
  const { profile, origin } = useEditor();
  const [pending, run] = useRun();
  const [name, setName] = useState(profile.name);
  const [updateInterval, setUpdateInterval] = useState(profile.updateInterval);
  const [showQr, setShowQr] = useState(false);
  const link = `${origin}/api/sub/${profile.token}`;

  const save = () => run(() => updateProfileSettings({ id: profile.id, name, updateInterval }), { success: "已保存" });

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="grid min-w-0 content-start gap-4">
          <div className="grid gap-1">
            <h2 className="text-sm font-medium">基本设置</h2>
            <p className="text-sm text-muted-foreground">方案名称和客户端自动更新频率。</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="profile-name">名称</Label>
              <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-update-interval">客户端更新间隔（小时）</Label>
              <Input
                id="profile-update-interval"
                type="number"
                min={1}
                value={updateInterval}
                onChange={(e) => setUpdateInterval(Number(e.target.value))}
              />
            </div>
            <Button className="w-full sm:col-start-2 sm:w-auto sm:justify-self-end" onClick={save} disabled={pending}>
              保存
            </Button>
          </div>
        </section>

        <section className="grid min-w-0 content-start gap-3 border-t pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
          <div className="grid gap-1">
            <h2 className="text-sm font-medium">订阅链接</h2>
            <p className="text-sm text-muted-foreground">在 mihomo 客户端中添加此链接。</p>
          </div>
          <MaskedSubscriptionLink value={link} />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <a href={link} target="_blank" rel="noreferrer">
                <ExternalLinkIcon />
                打开
              </a>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowQr(true)}>
              <QrCodeIcon />
              二维码
            </Button>
            <ConfirmButton
              title="重置订阅链接？"
              description="旧链接将立即失效，需要在客户端更新为新链接。"
              confirmText="重置"
              variant="ghost"
              size="sm"
              onConfirm={() => run(() => resetProfileToken(profile.id), { success: "已重置" })}
            >
              <RotateCcwIcon />
              重置
            </ConfirmButton>
          </div>
        </section>
      </div>

      <section className="grid gap-3 border-t pt-5">
        <h2 className="text-sm font-medium">配置预览</h2>
        <PreviewTab />
      </section>

      <Dialog open={showQr} onOpenChange={setShowQr}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>订阅二维码</DialogTitle>
            <DialogDescription>使用客户端扫描二维码添加订阅。</DialogDescription>
          </DialogHeader>
          <div className="mx-auto rounded-lg border bg-white p-3">
            <QRCodeSVG value={link} size={208} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
