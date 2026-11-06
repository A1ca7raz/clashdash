import "server-only";
import { eq, inArray } from "drizzle-orm";
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

export async function refreshSubscription(db: Db, sub: Subscription, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<RefreshResult> {
  const attemptAt = new Date();
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

    await db.transaction(async (tx) => {
      await tx.delete(nodes).where(eq(nodes.subscriptionId, sub.id));
      await tx.insert(nodes).values(
        parsed.nodes.map((n, i) => ({ subscriptionId: sub.id, name: n.name, type: n.type, config: n, sort: i })),
      );
      await tx
        .update(subscriptions)
        .set({
          lastAttemptAt: attemptAt,
          lastFetchedAt: attemptAt,
          lastError: parsed.errors.length ? `${parsed.errors.length} 条无法解析，已跳过` : null,
          userinfo: userinfo ?? sub.userinfo,
          nodeCount: parsed.nodes.length,
        })
        .where(eq(subscriptions.id, sub.id));
    });
    return { id: sub.id, ok: true, count: parsed.nodes.length };
  } catch (err) {
    const e = err as Error;
    const message = e.name === "TimeoutError" ? `请求超时（${timeoutMs / 1000}s）` : e.message;
    await db.update(subscriptions).set({ lastAttemptAt: attemptAt, lastError: message }).where(eq(subscriptions.id, sub.id));
    return { id: sub.id, ok: false, count: sub.nodeCount, error: message };
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
