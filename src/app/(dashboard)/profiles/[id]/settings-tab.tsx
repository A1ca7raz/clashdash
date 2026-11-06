"use client";

import { ArrowDownIcon, ArrowUpIcon, ExternalLinkIcon, PlusIcon, RotateCcwIcon, Trash2Icon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useState, type ReactNode } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRun } from "@/components/use-run";
import {
  applyProfilePreset,
  deleteProfile,
  resetProfileToken,
  updateProfileSettings,
} from "@/server/actions/profiles";
import { useEditor } from "./context";

export function SettingsTab() {
  const { profile, subscriptions, manualNodes, listeners, origin } = useEditor();
  const router = useRouter();
  const [pending, run] = useRun();
  const [name, setName] = useState(profile.name);
  const [updateInterval, setUpdateInterval] = useState(profile.updateInterval);
  const [subscriptionIds, setSubscriptionIds] = useState(
    profile.subscriptionIds.filter((id) => subscriptions.some((s) => s.id === id)),
  );
  const [manualNodeIds, setManualNodeIds] = useState(profile.manualNodeIds.filter((id) => manualNodes.some((n) => n.id === id)));
  const [listenerIds, setListenerIds] = useState(profile.listenerIds.filter((id) => listeners.some((l) => l.id === id)));
  const link = `${origin}/api/sub/${profile.token}`;

  const save = () =>
    run(() => updateProfileSettings({ id: profile.id, name, updateInterval, subscriptionIds, manualNodeIds, listenerIds }), {
      success: "已保存",
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <Card>
        <CardHeader>
          <CardTitle>基本设置与订阅</CardTitle>
          <CardDescription>
            按顺序写入配置：inline 订阅的节点和添加的手动节点写入 proxies，provider 订阅输出为 proxy-providers，监听器写入 listeners。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-[1fr_10rem] gap-3">
            <div className="grid gap-1.5">
              <Label>名称</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>客户端更新间隔（小时）</Label>
              <Input type="number" min={1} value={updateInterval} onChange={(e) => setUpdateInterval(Number(e.target.value))} />
            </div>
          </div>

          <OrderedPicker
            label="选用的订阅"
            empty="未选用任何订阅"
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
            empty={manualNodes.length ? "未添加手动节点" : "还没有手动节点，可在「手动节点」页面导入"}
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
            empty={listeners.length ? "未添加监听器" : "还没有监听器，可在「节点与监听器」页面创建"}
            items={listeners}
            value={listenerIds}
            onChange={setListenerIds}
            badges={(l) => (
              <>
                <span className="text-xs text-muted-foreground">
                  {l.type === "tun" ? "" : `:${l.port} · `}
                  {l.proxy ? `代理 ${l.proxy}` : l.subRule ? `子规则 ${l.subRule}` : "主规则"}
                </span>
                <Badge variant="secondary">{l.type}</Badge>
                {!l.enabled && <Badge variant="destructive">已停用</Badge>}
              </>
            )}
          />

          <div>
            <Button onClick={save} disabled={pending}>
              保存
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid content-start gap-4">
        <Card>
          <CardHeader>
            <CardTitle>订阅链接</CardTitle>
            <CardDescription>在 mihomo 客户端中添加此链接。重置后旧链接立即失效。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex gap-2">
              <Input readOnly value={link} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
              <CopyButton value={link} size="icon-sm" />
            </div>
            <div className="flex justify-center rounded-lg border bg-white p-3">
              <QRCodeSVG value={link} size={168} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={link} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon />
                  打开
                </a>
              </Button>
              <ConfirmButton
                title="重置订阅链接？"
                description="旧链接将立即失效，需要在客户端更新为新链接。"
                confirmText="重置"
                variant="outline"
                size="sm"
                onConfirm={() => run(() => resetProfileToken(profile.id), { success: "已重置" })}
              >
                <RotateCcwIcon />
                重置链接
              </ConfirmButton>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>其他操作</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <ConfirmButton
              title="应用内置模板？"
              description="会删除当前方案的全部代理组和规则，替换为内置模板（缺少的规则集会自动添加）。"
              confirmText="应用"
              variant="outline"
              size="sm"
              onConfirm={() => run(() => applyProfilePreset(profile.id), { success: "已应用模板" })}
            >
              应用内置模板
            </ConfirmButton>
            <ConfirmButton
              title={`删除配置方案「${profile.name}」？`}
              description="代理组、规则和监听器会一并删除，订阅链接失效。"
              variant="destructive"
              size="sm"
              onConfirm={() => run(() => deleteProfile(profile.id), { onOk: () => router.push("/profiles") })}
            >
              <Trash2Icon />
              删除方案
            </ConfirmButton>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function OrderedPicker<T extends { id: number; name: string }>({
  label,
  empty,
  items,
  value,
  onChange,
  badges,
}: {
  label: string;
  empty: string;
  items: T[];
  value: number[];
  onChange: (ids: number[]) => void;
  badges: (item: T) => ReactNode;
}) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const unselected = items.filter((i) => !value.includes(i.id));
  const move = (i: number, d: -1 | 1) => {
    const next = [...value];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };

  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {value.length === 0 && <p className="text-sm text-muted-foreground">{empty}</p>}
      <div className="divide-y rounded-lg border empty:hidden">
        {value.map((id, i) => {
          const item = byId.get(id)!;
          return (
            <div key={id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className="flex-1">{item.name}</span>
              {badges(item)}
              <Button variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUpIcon />
              </Button>
              <Button variant="ghost" size="icon-sm" disabled={i === value.length - 1} onClick={() => move(i, 1)}>
                <ArrowDownIcon />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => onChange(value.filter((x) => x !== id))}>
                <XIcon />
              </Button>
            </div>
          );
        })}
      </div>
      {unselected.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {unselected.map((item) => (
            <Button key={item.id} variant="outline" size="sm" onClick={() => onChange([...value, item.id])}>
              <PlusIcon />
              {item.name}
            </Button>
          ))}
          {unselected.length > 1 && (
            <Button variant="ghost" size="sm" onClick={() => onChange([...value, ...unselected.map((i) => i.id)])}>
              全部添加
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
