"use server";

import { asc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { nodes, profiles, proxyGroups, subscriptions } from "@/db/schema";
import { parseSubscription } from "@/lib/parser";
import { applyProcessing, validateProcessing } from "@/lib/processing";
import type { Processing } from "@/lib/types";
import { refreshMany, refreshSubscription } from "@/server/fetcher";
import { run } from "./common";

const processingSchema = z.object({
  include: z.string().optional(),
  exclude: z.string().optional(),
  rename: z.array(z.object({ pattern: z.string(), target: z.string() })).optional(),
  flag: z.boolean().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
});

const subscriptionSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().trim().min(1, "不能为空"),
  url: z.string().trim().url("不是有效的地址"),
  userAgent: z.string().trim().default("clash.meta"),
  enabled: z.boolean(),
  mode: z.enum(["inline", "provider"]),
  cacheTtl: z.number().int().min(60, "至少 60 秒"),
  processing: processingSchema,
  providerOptions: z.object({
    interval: z.number().int().positive().optional(),
    healthCheck: z
      .object({
        enable: z.boolean(),
        url: z.string().optional(),
        interval: z.number().int().positive().optional(),
        lazy: z.boolean().optional(),
      })
      .optional(),
  }),
});

export type SubscriptionInput = z.input<typeof subscriptionSchema>;

function cleanProcessing(p: Processing): Processing {
  return {
    ...(p.include?.trim() ? { include: p.include.trim() } : {}),
    ...(p.exclude?.trim() ? { exclude: p.exclude.trim() } : {}),
    ...(p.rename?.some((r) => r.pattern) ? { rename: p.rename.filter((r) => r.pattern) } : {}),
    ...(p.flag ? { flag: true } : {}),
    ...(p.prefix ? { prefix: p.prefix } : {}),
    ...(p.suffix ? { suffix: p.suffix } : {}),
  };
}

export async function saveSubscription(input: SubscriptionInput) {
  return run(async (db) => {
    const v = subscriptionSchema.parse(input);
    const processing = cleanProcessing(v.processing);
    const errs = validateProcessing(processing);
    if (errs.length) throw new Error(errs.join("；"));

    const values = { ...v, processing };
    let row;
    if (v.id) {
      const [before] = await db.select().from(subscriptions).where(eq(subscriptions.id, v.id));
      [row] = await db.update(subscriptions).set(values).where(eq(subscriptions.id, v.id)).returning();
      if (before && (before.url !== v.url || before.userAgent !== v.userAgent)) await refreshSubscription(db, row);
    } else {
      const count = await db.$count(subscriptions);
      [row] = await db.insert(subscriptions).values({ ...values, sort: count }).returning();
      await refreshSubscription(db, row);
    }
    revalidatePath("/", "layout");
    return row.id;
  });
}

export async function deleteSubscription(id: number) {
  return run(async (db) => {
    await db.transaction(async (tx) => {
      await tx.delete(subscriptions).where(eq(subscriptions.id, id));
      for (const p of await tx.select().from(profiles)) {
        if (p.subscriptionIds.includes(id)) {
          await tx.update(profiles).set({ subscriptionIds: p.subscriptionIds.filter((x) => x !== id) }).where(eq(profiles.id, p.id));
        }
      }
      for (const g of await tx.select().from(proxyGroups)) {
        if (g.members.sources.subscriptions.includes(id)) {
          const sources = { ...g.members.sources, subscriptions: g.members.sources.subscriptions.filter((x) => x !== id) };
          await tx.update(proxyGroups).set({ members: { ...g.members, sources } }).where(eq(proxyGroups.id, g.id));
        }
      }
    });
    revalidatePath("/", "layout");
  });
}

export async function refreshSubscriptions(ids: number[] | "all") {
  return run(async (db) => {
    const results = await refreshMany(db, ids, { force: true });
    revalidatePath("/", "layout");
    return results;
  });
}

export async function reorderSubscriptions(ids: number[]) {
  return run(async (db) => {
    await db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) await tx.update(subscriptions).set({ sort: i }).where(eq(subscriptions.id, id));
    });
    revalidatePath("/", "layout");
  });
}

export interface PreviewRow {
  originalName: string;
  name: string | null;
  type: string;
  server: string;
}

/** Before/after view of a subscription's snapshot, optionally with unsaved processing settings. */
export async function previewSubscription(id: number, processing?: Processing) {
  return run(async (db) => {
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, id));
    if (!sub) throw new Error("订阅不存在");
    const p = cleanProcessing(processing ?? sub.processing);
    const errs = validateProcessing(p);
    if (errs.length) throw new Error(errs.join("；"));
    const rows = await db.select().from(nodes).where(eq(nodes.subscriptionId, id)).orderBy(asc(nodes.sort));
    const kept = new Map(applyProcessing(rows, p).map((r) => [r.node.id, r.name]));
    return {
      lastFetchedAt: sub.lastFetchedAt?.toISOString() ?? null,
      rows: rows.map<PreviewRow>((n) => ({
        originalName: n.name,
        name: kept.get(n.id) ?? null,
        type: n.type,
        server: String(n.config.server ?? ""),
      })),
    };
  });
}

/** Parses pasted content without saving; used to check a subscription body or manual nodes. */
export async function parseContent(text: string) {
  return run(async () => {
    const r = parseSubscription(text);
    return { format: r.format, count: r.nodes.length, errors: r.errors, names: r.nodes.map((n) => n.name) };
  });
}

export async function countManualNodes() {
  return run(async (db) => db.$count(nodes, isNull(nodes.subscriptionId)));
}
