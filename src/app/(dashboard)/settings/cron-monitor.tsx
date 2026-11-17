"use client";

import { AlertTriangleIcon, Clock3Icon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { SubscriptionCronStatus } from "@/server/subscription-cron";

export function CronMonitor({ initialStatus, unavailable }: { initialStatus: SubscriptionCronStatus; unavailable: boolean }) {
  const [status, setStatus] = useState(initialStatus);
  const [refreshing, setRefreshing] = useState(false);
  const [pollError, setPollError] = useState(false);
  const active = useRef(false);
  const inFlight = useRef(false);

  const update = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const response = await fetch("/api/cron/status", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to fetch cron status");
      const next = (await response.json()) as SubscriptionCronStatus;
      if (active.current) {
        setStatus(next);
        setPollError(false);
      }
    } catch {
      if (active.current) setPollError(true);
    } finally {
      inFlight.current = false;
      if (active.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    active.current = true;
    if (unavailable) return () => { active.current = false; };
    void update();
    const timer = setInterval(update, 5000);
    return () => {
      active.current = false;
      clearInterval(timer);
    };
  }, [unavailable, update]);

  return (
    <section className="grid gap-4 border-t pt-5">
      <div className="flex items-center justify-between gap-4">
        <div className="grid gap-1">
          <h2 className="text-sm font-medium">内建 Cron 监视器</h2>
          <p className="text-sm text-muted-foreground">每 5 秒自动更新，仅统计当前 Node.js 进程。</p>
        </div>
        {!unavailable && (
          <Button variant="ghost" size="sm" disabled={refreshing} onClick={() => void update()}>
            <RefreshCwIcon className={refreshing ? "animate-spin" : undefined} />
            刷新状态
          </Button>
        )}
      </div>

      <Card className="gap-0 py-0">
        {unavailable || !status.startedAt ? (
          <div className="flex items-center gap-3 p-5">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Clock3Icon className="size-5" />
            </div>
            <div className="grid gap-1">
              <p className="font-medium">{unavailable ? "当前环境不使用内建 Cron" : "调度器尚未启动"}</p>
              <p className="text-sm text-muted-foreground">
                {unavailable ? "Vercel 部署请配置外部 Cron 调用刷新接口。" : "请检查服务启动日志；调度器注册后，状态会在这里自动显示。"}
              </p>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
            <TimeMetric label="最近成功刷新" value={status.lastSuccessfulRefreshAt} />
            <TimeMetric label="下次刷新" value={status.nextRefreshAt} future />
            <Metric label="累计刷新次数" value={status.totalRefreshes} />
            <Metric
              label="连续刷新失败次数"
              value={status.consecutiveFailures}
              className={status.consecutiveFailures ? "text-destructive" : undefined}
            />
          </dl>
        )}
      </Card>
      {pollError && (
        <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
          <AlertTriangleIcon className="size-4" />
          状态更新失败，将自动重试。
        </p>
      )}
    </section>
  );
}

function Metric({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className={cn("bg-card p-4", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">
        {value}
        <span className="ml-1 text-xs font-normal text-muted-foreground">次</span>
      </dd>
    </div>
  );
}

function TimeMetric({ label, value, future = false }: { label: string; value: string | null; future?: boolean }) {
  return (
    <div className="bg-card p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-sm font-medium">
        <time dateTime={value ?? undefined} title={value ? formatDateTime(value) : undefined} suppressHydrationWarning>
          {value ? (future ? formatNextRefresh(value) : formatRelative(value)) : "暂无"}
        </time>
      </dd>
    </div>
  );
}

function formatNextRefresh(value: string): string {
  const diff = new Date(value).getTime() - Date.now();
  if (diff <= 0) return "即将刷新";
  const seconds = Math.ceil(diff / 1000);
  if (seconds < 60) return `${seconds} 秒后`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟后`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return `${hours} 小时后`;
  return `${Math.ceil(hours / 24)} 天后`;
}
