"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRun } from "@/components/use-run";
import { createProfile } from "@/server/actions/profiles";

interface ProfileSummary {
  id: number;
  name: string;
  token: string;
  subscriptionCount: number;
  listenerCount: number;
}

export function ProfilesClient({
  origin,
  profiles,
  counts,
}: {
  origin: string;
  profiles: ProfileSummary[];
  counts: Record<"groups" | "rules", Record<number, number>>;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageHeader
        title="配置方案"
        description="每个配置方案生成一份 mihomo 配置，对应一个订阅链接。"
        actions={
          <Button onClick={() => setCreating(true)}>
            <PlusIcon />
            新建配置方案
          </Button>
        }
      />
      {profiles.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          还没有配置方案。建议先在「订阅」中添加订阅，再新建配置方案。
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {profiles.map((p) => {
            const link = `${origin}/api/sub/${p.token}`;
            return (
              <Card key={p.id}>
                <CardHeader>
                  <CardTitle>
                    <Link href={`/profiles/${p.id}`} className="hover:underline">
                      {p.name}
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    {p.subscriptionCount} 个订阅 · {counts.groups[p.id] ?? 0} 个代理组 · {counts.rules[p.id] ?? 0} 条规则 ·{" "}
                    {p.listenerCount} 个监听器
                  </CardDescription>
                  <CardAction>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/profiles/${p.id}`}>编辑</Link>
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent className="flex items-center gap-2">
                  <Input readOnly value={link} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                  <CopyButton value={link} size="icon-sm" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {creating && <CreateDialog onClose={() => setCreating(false)} />}
    </>
  );
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, run] = useRun();
  const [name, setName] = useState("");
  const [preset, setPreset] = useState(true);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建配置方案</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={preset} onCheckedChange={(v) => setPreset(v === true)} className="mt-0.5" />
            <span>
              使用内置模板初始化
              <span className="block text-xs text-muted-foreground">
                基于 MetaCubeX meta-rules-dat 的基础分流：节点选择、自动选择、漏网之鱼三个代理组及对应规则。
              </span>
            </span>
          </label>
          <p className="text-xs text-muted-foreground">新方案默认选用全部订阅，可在编辑页调整。</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={pending || !name.trim()}
            onClick={() => run(() => createProfile({ name, preset }), { onOk: (id) => router.push(`/profiles/${id}`) })}
          >
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
