"use server";

import { asc, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Db } from "@/db";
import { nodes, proxyGroups, subscriptions } from "@/db/schema";
import { removeGroupSubscriptionsYaml, renameGroupSubscriptionYaml } from "@/lib/group-config";
import { parseSubscription } from "@/lib/parser";
import { applyProcessing, validateProcessing } from "@/lib/processing";
import { parseProviderSubscription, subscriptionSchema, type SubscriptionInput } from "@/lib/subscription-config";
import type { Processing } from "@/lib/types";
import { refreshMany, refreshSubscription } from "@/server/fetcher";
import { clearPointerReferences, loadYamlPointers, syncPointerReferences } from "@/server/pointer-references";
import { run } from "./common";

export type { SubscriptionInput } from "@/lib/subscription-config";

const batchIdsSchema = z.array(z.number().int()).min(1).transform((ids) => [...new Set(ids)]);

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

async function persistSubscription(db: Db, input: SubscriptionInput, yaml: string | null) {
  const v = subscriptionSchema.parse(input);
  const processing = cleanProcessing(v.processing);
  const errs = validateProcessing(processing);
  if (errs.length) throw new Error(errs.join("；"));

  const values = { ...v, processing, yaml };
  const { row, shouldRefresh } = await db.transaction(async (tx) => {
    const [before] = v.id ? await tx.select().from(subscriptions).where(eq(subscriptions.id, v.id)) : [];
    const [saved] = v.id
      ? await tx.update(subscriptions).set(values).where(eq(subscriptions.id, v.id)).returning()
      : await tx.insert(subscriptions).values({ ...values, sort: await tx.$count(subscriptions) }).returning();
    if (!saved) throw new Error("订阅不存在");

    if (before && before.name !== saved.name) {
      for (const group of await tx.select().from(proxyGroups)) {
        if (!group.yaml) continue;
        const updated = renameGroupSubscriptionYaml(group.yaml, before.name, saved.name);
        if (updated !== group.yaml) await tx.update(proxyGroups).set({ yaml: updated }).where(eq(proxyGroups.id, group.id));
      }
    }
    if (yaml === null) await clearPointerReferences(tx, "subscription", [saved.id]);
    else await syncPointerReferences(tx, "subscription", saved.id, yaml);

    return {
      row: saved,
      shouldRefresh: !before || before.url !== saved.url || before.userAgent !== saved.userAgent,
    };
  });
  if (shouldRefresh) await refreshSubscription(db, row);
  revalidatePath("/", "layout");
  return row.id;
}

export async function saveSubscription(input: SubscriptionInput) {
  return run((db) => persistSubscription(db, input, null));
}

export async function saveProviderSubscription(yamlText: string, id?: number) {
  return run(async (db) => {
    const pointers = await loadYamlPointers(db);
    const values = parseProviderSubscription(yamlText, pointers);
    return persistSubscription(db, { id, mode: "provider", ...values }, yamlText);
  });
}

async function removeSubscriptions(db: Db, ids: number[]) {
  return db.transaction(async (tx) => {
    const selectedRows = await tx
      .select({ id: subscriptions.id, name: subscriptions.name })
      .from(subscriptions)
      .where(inArray(subscriptions.id, ids));
    const selected = new Set(selectedRows.map((row) => row.id));
    const deletedNames = selectedRows.map((row) => row.name);
    const deleted = await tx.delete(subscriptions).where(inArray(subscriptions.id, ids)).returning({ id: subscriptions.id });
    if (deleted.length) await clearPointerReferences(tx, "subscription", deleted.map((row) => row.id));

    for (const group of await tx.select().from(proxyGroups)) {
      const membersChanged = group.members.sources.subscriptions.some((id) => selected.has(id));
      const sources = {
        ...group.members.sources,
        subscriptions: group.members.sources.subscriptions.filter((id) => !selected.has(id)),
      };
      const yaml = group.yaml ? removeGroupSubscriptionsYaml(group.yaml, deletedNames) : group.yaml;
      if (membersChanged || yaml !== group.yaml) {
        await tx
          .update(proxyGroups)
          .set({ ...(membersChanged ? { members: { ...group.members, sources } } : {}), ...(yaml !== group.yaml ? { yaml } : {}) })
          .where(eq(proxyGroups.id, group.id));
      }
    }
    return deleted.length;
  });
}

export async function deleteSubscriptions(ids: number[]) {
  return run(async (db) => {
    const count = await removeSubscriptions(db, batchIdsSchema.parse(ids));
    revalidatePath("/", "layout");
    return count;
  });
}

export async function deleteSubscription(id: number) {
  return run(async (db) => {
    await removeSubscriptions(db, [id]);
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
