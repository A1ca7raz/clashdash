import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import {
  listeners,
  nodes,
  pointerReferences,
  pointers,
  profileListeners,
  profileManualNodes,
  profiles,
  profileSubscriptions,
  proxyGroups,
  ruleProviders,
  rules,
  subscriptions,
} from "@/db/schema";
import { rebuildAllPointerReferences } from "./pointer-references";

const BACKUP_VERSION = 3;

/** Insert order respects foreign keys; deletion runs in reverse. */
const TABLES = [
  ["pointers", pointers],
  ["subscriptions", subscriptions],
  ["nodes", nodes],
  ["profiles", profiles],
  ["proxyGroups", proxyGroups],
  ["ruleProviders", ruleProviders],
  ["rules", rules],
  ["listeners", listeners],
  ["profileSubscriptions", profileSubscriptions],
  ["profileManualNodes", profileManualNodes],
  ["profileListeners", profileListeners],
] as const;

type TableKey = (typeof TABLES)[number][0];
const SQL_NAMES: Partial<Record<TableKey, string>> = {
  pointers: "pointers",
  subscriptions: "subscriptions",
  nodes: "nodes",
  profiles: "profiles",
  proxyGroups: "proxy_groups",
  ruleProviders: "rule_providers",
  rules: "rules",
  listeners: "listeners",
};

const DATE_FIELDS = ["createdAt", "updatedAt", "lastAttemptAt", "lastFetchedAt", "lastPulledAt", "refreshingAt"];
const rowSchema = z.record(z.string(), z.unknown());
const backupSchema = z.object({
  version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  exportedAt: z.string(),
  data: z.object(Object.fromEntries(TABLES.map(([key]) => [key, z.array(rowSchema)])) as Record<TableKey, z.ZodArray<typeof rowSchema>>),
});

function normalizeLegacyBackup(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const version = (raw as { version?: unknown }).version;
  if (version !== 1 && version !== 2) return raw;
  const data = (raw as { data?: unknown }).data;
  if (!data || typeof data !== "object") return raw;
  const source = data as Record<string, unknown>;
  if (version === 2) return { ...raw, data: { ...source, pointers: [] } };
  const oldProfiles = Array.isArray(source.profiles) ? source.profiles : [];
  const profileSubscriptionsRows: Record<string, unknown>[] = [];
  const profileManualNodesRows: Record<string, unknown>[] = [];
  const profileListenersRows: Record<string, unknown>[] = [];

  const normalizedProfiles = oldProfiles.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return row;
    const profile = row as Record<string, unknown>;
    const profileId = profile.id;
    const addLinks = (
      field: "subscriptionIds" | "manualNodeIds" | "listenerIds",
      resourceField: "subscriptionId" | "nodeId" | "listenerId",
      target: Record<string, unknown>[],
    ) => {
      const ids = Array.isArray(profile[field]) ? profile[field] : [];
      ids.forEach((resourceId, sort) => {
        if (typeof profileId === "number" && typeof resourceId === "number") {
          target.push({ profileId, [resourceField]: resourceId, sort });
        }
      });
    };
    addLinks("subscriptionIds", "subscriptionId", profileSubscriptionsRows);
    addLinks("manualNodeIds", "nodeId", profileManualNodesRows);
    addLinks("listenerIds", "listenerId", profileListenersRows);
    const rest = { ...profile };
    delete rest.subscriptionIds;
    delete rest.manualNodeIds;
    delete rest.listenerIds;
    return rest;
  });

  return {
    ...raw,
    data: {
      ...source,
      profiles: normalizedProfiles,
      profileSubscriptions: profileSubscriptionsRows,
      profileManualNodes: profileManualNodesRows,
      profileListeners: profileListenersRows,
      pointers: [],
    },
  };
}

export async function exportAll(db: Db) {
  const data: Record<string, unknown[]> = {};
  for (const [key, table] of TABLES) data[key] = await db.select().from(table);
  return { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
}

/** Replaces all data with the backup. Ids are preserved, then serial sequences are realigned. */
export async function importAll(db: Db, raw: unknown) {
  const backup = backupSchema.parse(normalizeLegacyBackup(raw));
  await db.transaction(async (tx) => {
    await tx.delete(pointerReferences);
    for (const [, table] of [...TABLES].reverse()) await tx.delete(table);
    for (const [key, table] of TABLES) {
      const rows = backup.data[key].map((row) => {
        const out: Record<string, unknown> = { ...row };
        if (key === "subscriptions" && "cacheTtl" in out) {
          if (!("refreshInterval" in out)) out.refreshInterval = out.cacheTtl;
          delete out.cacheTtl;
        }
        for (const f of DATE_FIELDS) if (typeof out[f] === "string") out[f] = new Date(out[f] as string);
        return out;
      });
      // Insert in chunks to stay below parameter limits.
      for (let i = 0; i < rows.length; i += 500) {
        await tx.insert(table).values(rows.slice(i, i + 500) as never);
      }
      const name = SQL_NAMES[key];
      if (name) {
        await tx.execute(
          sql.raw(`SELECT setval(pg_get_serial_sequence('${name}', 'id'), COALESCE((SELECT MAX(id) FROM ${name}), 0) + 1, false)`),
        );
      }
    }
    await rebuildAllPointerReferences(tx);
  });
}
