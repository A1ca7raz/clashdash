"use client";

import { CopyIcon, PencilIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BatchManagementControls,
  BatchSelectionCheckbox,
  useBatchManagement,
  type BatchManagement,
} from "@/components/batch-management";
import { MaskedSubscriptionLink } from "@/components/masked-subscription-link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRun } from "@/components/use-run";
import { formatDateTime, formatRelative } from "@/lib/format";
import { createProfile, deleteProfiles, duplicateProfile } from "@/server/actions/profiles";

interface ProfileSummary {
  id: number;
  name: string;
  token: string;
  lastPulledAt: string | null;
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
  const [pending, run] = useRun();
  const batch = useBatchManagement(profiles.map((profile) => profile.id));
  const remove = () =>
    run(() => deleteProfiles([...batch.selectedIds]), {
      success: (count) => `已删除 ${count} 个配置方案`,
      onOk: batch.clear,
    });

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
      <div className="mb-4">
        <BatchManagementControls
          batch={batch}
          totalCount={profiles.length}
          pending={pending}
          deleteDescription="将删除所选配置方案的私有代理组、规则及方案关联，订阅链接会立即失效；订阅、手动节点、监听器和规则集等共享资源会保留。"
          onDelete={remove}
        />
      </div>
      {profiles.length === 0 ? (
        <div className="py-8 text-sm text-muted-foreground">还没有配置方案。建议先在「订阅」中添加订阅，再新建配置方案。</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {profiles.map((profile) => (
            <ProfileCard
              key={profile.id}
              origin={origin}
              profile={profile}
              groupCount={counts.groups[profile.id] ?? 0}
              ruleCount={counts.rules[profile.id] ?? 0}
              batch={batch}
              pending={pending}
            />
          ))}
        </div>
      )}
      {creating && <CreateDialog onClose={() => setCreating(false)} />}
    </>
  );
}

function ProfileCard({
  origin,
  profile,
  groupCount,
  ruleCount,
  batch,
  pending,
}: {
  origin: string;
  profile: ProfileSummary;
  groupCount: number;
  ruleCount: number;
  batch: BatchManagement;
  pending: boolean;
}) {
  const [duplicating, run] = useRun();
  const link = `${origin}/api/sub/${profile.token}`;
  return (
    <Card data-state={batch.selectedIds.has(profile.id) ? "selected" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BatchSelectionCheckbox
            label={`选择配置方案「${profile.name}」`}
            checked={batch.selectedIds.has(profile.id)}
            disabled={pending}
            onToggle={() => batch.toggle(profile.id)}
          />
          <Link href={`/profiles/${profile.id}`} className="hover:underline">
            {profile.name}
          </Link>
        </CardTitle>
        <CardDescription>
          {profile.subscriptionCount} 个订阅 · {groupCount} 个代理组 · {ruleCount} 条规则 · {profile.listenerCount} 个监听器 ·{" "}
          <LastPulled value={profile.lastPulledAt} />
        </CardDescription>
        <CardAction className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            title="创建副本"
            aria-label={`创建配置方案「${profile.name}」的副本`}
            disabled={pending || duplicating}
            onClick={() => run(() => duplicateProfile(profile.id), { success: "已创建副本" })}
          >
            <CopyIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" title="编辑" aria-label={`编辑配置方案「${profile.name}」`} asChild>
            <Link href={`/profiles/${profile.id}`}>
              <PencilIcon />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <MaskedSubscriptionLink value={link} />
      </CardContent>
    </Card>
  );
}

function LastPulled({ value }: { value: string | null }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={value ?? undefined} className="cursor-help">
          {formatRelative(value)}拉取
        </time>
      </TooltipTrigger>
      <TooltipContent>{value ? formatDateTime(value) : "从未拉取"}</TooltipContent>
    </Tooltip>
  );
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, run] = useRun();
  const [name, setName] = useState("");
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
          <p className="text-xs text-muted-foreground">新方案默认选用全部订阅，可在编辑页调整。</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={pending || !name.trim()}
            onClick={() => run(() => createProfile({ name }), { onOk: (id) => router.push(`/profiles/${id}`) })}
          >
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
