import "server-only";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import type { Db } from "@/db";
import { nodes, subscriptions, type Subscription } from "@/db/schema";
import { parseSubscription } from "@/lib/parser";
import type { UserInfo } from "@/lib/types";

export const DEFAULT_TIMEOUT_MS = 8000;

export function parseUserInfo(header: string | null): UserInfo | null {
  if (!header) return null;
  const kv = Object.fromEntries(
    header.split(";").map((part) => {
      const [k, v] = part.split("=").map((s) => s.trim());
      return [k.toLowerCase(), Number(v)];
    }),
  );
  if (![kv.upload, kv.download, kv.total].some((v) => Number.isFinite(v))) return null;
  return {
    upload: kv.upload || 0,
    download: kv.download || 0,
    total: kv.total || 0,
    ...(kv.expire ? { expire: kv.expire } : {}),
  };
}

export interface RefreshResult {
  id: number;
  ok: boolean;
  count: number;
  error?: string;
}

const REFRESH_LOCK_MS = 30_000;
const REFRESH_WAIT_POLL_MS = 25;

function hasSameConfig(a: Subscription, b: Subscription): boolean {
  return a.url === b.url && a.userAgent === b.userAgent;
}

function resultFromRow(sub: Subscription): RefreshResult {
  if (!sub.lastAttemptAt) {
    return { id: sub.id, ok: false, count: sub.nodeCount, error: "刷新结束但未记录结果" };
  }
  const ok = sub.lastFetchedAt?.getTime() === sub.lastAttemptAt.getTime();
  return {
    id: sub.id,
    ok,
    count: sub.nodeCount,
    ...(!ok ? { error: sub.lastError ?? "刷新失败" } : {}),
  };
}

export async function refreshSubscription(db: Db, sub: Subscription, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<RefreshResult> {
  return refreshSubscriptionInternal(db, sub, timeoutMs, Date.now() + Math.max(0, timeoutMs));
}

async function refreshSubscriptionInternal(
  db: Db,
  initialSub: Subscription,
  timeoutMs: number,
  waitDeadline: number,
): Promise<RefreshResult> {
  let sub = initialSub;

  while (true) {
    const attemptAt = new Date();
    const lockExpiredBefore = new Date(attemptAt.getTime() - REFRESH_LOCK_MS);
    const claimed = await db
      .update(subscriptions)
      .set({ refreshingAt: attemptAt })
      .where(
        and(
          eq(subscriptions.id, sub.id),
          or(isNull(subscriptions.refreshingAt), lt(subscriptions.refreshingAt, lockExpiredBefore)),
        ),
      )
      .returning({ id: subscriptions.id });

    if (!claimed.length) {
      let latest: Subscription;
      let waitingForAttempt: number | null = null;
      while (true) {
        const rows = await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id));
        if (!rows.length) return { id: sub.id, ok: false, count: sub.nodeCount, error: "订阅不存在" };
        latest = rows[0];
        if (!latest.refreshingAt) break;
        waitingForAttempt = latest.refreshingAt.getTime();
        const remainingMs = waitDeadline - Date.now();
        if (remainingMs <= 0) {
          return {
            id: sub.id,
            ok: false,
            count: latest.nodeCount,
            error: `等待订阅刷新超时（${timeoutMs / 1000}s）`,
          };
        }
        await new Promise((resolve) => setTimeout(resolve, Math.min(REFRESH_WAIT_POLL_MS, remainingMs)));
      }
      const completedWaitedAttempt =
        waitingForAttempt === null
          ? latest.lastAttemptAt !== null
          : latest.lastAttemptAt?.getTime() === waitingForAttempt;
      if (hasSameConfig(latest, sub) && completedWaitedAttempt) return resultFromRow(latest);
      sub = latest;
      continue;
    }

    try {
      const res = await fetch(sub.url, {
        headers: { "User-Agent": sub.userAgent || "clash.meta" },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = parseSubscription(text);
      if (parsed.nodes.length === 0) {
        throw new Error(parsed.errors[0] ?? "订阅中没有节点");
      }
      const userinfo = parseUserInfo(res.headers.get("subscription-userinfo"));

      let current: Subscription | undefined;
      const wrote = await db.transaction(async (tx) => {
        [current] = await tx.select().from(subscriptions).where(eq(subscriptions.id, sub.id));
        if (
          !current ||
          !hasSameConfig(current, sub) ||
          current.refreshingAt?.getTime() !== attemptAt.getTime()
        ) {
          return false;
        }
        await tx.delete(nodes).where(eq(nodes.subscriptionId, sub.id));
        await tx.insert(nodes).values(
          parsed.nodes.map((n, i) => ({ subscriptionId: sub.id, name: n.name, type: n.type, config: n, yaml: null, sort: i })),
        );
        await tx
          .update(subscriptions)
          .set({
            lastAttemptAt: attemptAt,
            lastFetchedAt: attemptAt,
            lastError: parsed.errors.length ? `${parsed.errors.length} 条无法解析，已跳过` : null,
            userinfo: userinfo ?? current.userinfo,
            nodeCount: parsed.nodes.length,
          })
          .where(eq(subscriptions.id, sub.id));
        return true;
      });
      if (!wrote) {
        return {
          id: sub.id,
          ok: false,
          count: current?.nodeCount ?? sub.nodeCount,
          error: "订阅配置已变更或刷新锁已失效，本次刷新已取消",
        };
      }
      return { id: sub.id, ok: true, count: parsed.nodes.length };
    } catch (err) {
      const e = err as Error;
      const message = e.name === "TimeoutError" ? `请求超时（${timeoutMs / 1000}s）` : e.message;
      await db
        .update(subscriptions)
        .set({ lastAttemptAt: attemptAt, lastError: message })
        .where(
          and(
            eq(subscriptions.id, sub.id),
            eq(subscriptions.url, sub.url),
            eq(subscriptions.userAgent, sub.userAgent),
            eq(subscriptions.refreshingAt, attemptAt),
          ),
        );
      return { id: sub.id, ok: false, count: sub.nodeCount, error: message };
    } finally {
      await db
        .update(subscriptions)
        .set({ refreshingAt: null })
        .where(and(eq(subscriptions.id, sub.id), eq(subscriptions.refreshingAt, attemptAt)));
    }
  }
}

export function isStale(sub: Subscription, now = Date.now()): boolean {
  if (!sub.lastAttemptAt) return true;
  return now - sub.lastAttemptAt.getTime() > sub.cacheTtl * 1000;
}

/** Refreshes enabled subscriptions concurrently; only stale ones unless `force`. */
export async function refreshMany(
  db: Db,
  ids: number[] | "all",
  { force = false, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
): Promise<RefreshResult[]> {
  const rows =
    ids === "all"
      ? await db.select().from(subscriptions)
      : ids.length
        ? await db.select().from(subscriptions).where(inArray(subscriptions.id, ids))
        : [];
  const targets = rows.filter((s) => s.enabled && (force || isStale(s)));
  const settled = await Promise.allSettled(targets.map((s) => refreshSubscription(db, s, timeoutMs)));
  return settled.map((r, i) =>
    r.status === "fulfilled" ? r.value : { id: targets[i].id, ok: false, count: 0, error: String(r.reason) },
  );
}
