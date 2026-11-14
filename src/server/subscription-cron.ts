import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { subscriptions } from "@/db/schema";
import { refreshMany } from "@/server/fetcher";

export interface SubscriptionCronStatus {
  startedAt: string | null;
  tickIntervalMs: number | null;
  running: boolean;
  lastCheckAt: string | null;
  lastFinishedAt: string | null;
  totalChecks: number;
  lastRun: { attempted: number; succeeded: number; failed: number } | null;
  lastError: string | null;
  lastSuccessfulRefreshAt: string | null;
  nextRefreshAt: string | null;
  totalRefreshes: number;
  consecutiveFailures: number;
}

const globalForCron = globalThis as unknown as {
  __clashdashSubscriptionCron?: NodeJS.Timeout;
  __clashdashSubscriptionCronStatus?: SubscriptionCronStatus;
};

function emptyStatus(): SubscriptionCronStatus {
  return {
    startedAt: null,
    tickIntervalMs: null,
    running: false,
    lastCheckAt: null,
    lastFinishedAt: null,
    totalChecks: 0,
    lastRun: null,
    lastError: null,
    lastSuccessfulRefreshAt: null,
    nextRefreshAt: null,
    totalRefreshes: 0,
    consecutiveFailures: 0,
  };
}

export function getSubscriptionCronStatus(): SubscriptionCronStatus {
  const status = globalForCron.__clashdashSubscriptionCronStatus ?? emptyStatus();
  return { ...status, lastRun: status.lastRun ? { ...status.lastRun } : null };
}

export async function getSubscriptionCronSnapshot(db: Db): Promise<SubscriptionCronStatus> {
  const status = getSubscriptionCronStatus();
  if (!status.startedAt) return status;
  const rows = await db
    .select({ lastAttemptAt: subscriptions.lastAttemptAt, refreshInterval: subscriptions.refreshInterval })
    .from(subscriptions)
    .where(eq(subscriptions.enabled, true));
  if (!rows.length) return status;
  const now = Date.now();
  const nextRefreshAt = Math.min(
    ...rows.map((row) => (row.lastAttemptAt ? row.lastAttemptAt.getTime() + row.refreshInterval * 1000 : now)),
  );
  return { ...status, nextRefreshAt: new Date(nextRefreshAt).toISOString() };
}

export function startSubscriptionCron(db: Db, tickMs = 30_000): NodeJS.Timeout {
  if (globalForCron.__clashdashSubscriptionCron) return globalForCron.__clashdashSubscriptionCron;
  const status: SubscriptionCronStatus = {
    ...emptyStatus(),
    startedAt: new Date().toISOString(),
    tickIntervalMs: tickMs,
  };
  globalForCron.__clashdashSubscriptionCronStatus = status;
  const tick = async () => {
    if (status.running) return;
    status.running = true;
    status.lastCheckAt = new Date().toISOString();
    status.totalChecks += 1;
    try {
      const results = await refreshMany(db, "all");
      const failed = results.filter((result) => !result.ok);
      status.lastRun = {
        attempted: results.length,
        succeeded: results.length - failed.length,
        failed: failed.length,
      };
      status.lastError = failed.map((result) => `订阅 #${result.id}：${result.error ?? "刷新失败"}`).join("；") || null;
      if (results.length) {
        status.totalRefreshes += results.length;
        status.consecutiveFailures = failed.length ? status.consecutiveFailures + 1 : 0;
        if (failed.length < results.length) status.lastSuccessfulRefreshAt = new Date().toISOString();
      }
    } catch (err) {
      status.lastRun = null;
      status.lastError = err instanceof Error ? err.message : String(err);
      status.consecutiveFailures += 1;
      console.error("Scheduled subscription refresh failed", err);
    } finally {
      status.lastFinishedAt = new Date().toISOString();
      status.running = false;
    }
  };
  const timer = setInterval(tick, tickMs);
  timer.unref();
  globalForCron.__clashdashSubscriptionCron = timer;
  void tick();
  return timer;
}
