import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { listeners, nodes, profiles, proxyGroups, ruleProviders, rules, subscriptions } from "@/db/schema";

const BACKUP_VERSION = 1;

/** Insert order respects foreign keys; deletion runs in reverse. */
const TABLES = [
  ["subscriptions", subscriptions],
  ["nodes", nodes],
  ["profiles", profiles],
  ["proxyGroups", proxyGroups],
  ["ruleProviders", ruleProviders],
  ["rules", rules],
  ["listeners", listeners],
] as const;

const SQL_NAMES: Record<(typeof TABLES)[number][0], string> = {
  subscriptions: "subscriptions",
  nodes: "nodes",
  profiles: "profiles",
  proxyGroups: "proxy_groups",
  ruleProviders: "rule_providers",
  rules: "rules",
  listeners: "listeners",
};

const DATE_FIELDS = ["createdAt", "updatedAt", "lastAttemptAt", "lastFetchedAt"];

const backupSchema = z.object({
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  data: z.object(Object.fromEntries(TABLES.map(([key]) => [key, z.array(z.record(z.string(), z.unknown()))])) as Record<
    (typeof TABLES)[number][0],
    z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>>
  >),
});

export async function exportAll(db: Db) {
  const data: Record<string, unknown[]> = {};
  for (const [key, table] of TABLES) data[key] = await db.select().from(table);
  return { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
}

/** Replaces all data with the backup. Ids are preserved, then serial sequences are realigned. */
export async function importAll(db: Db, raw: unknown) {
  const backup = backupSchema.parse(raw);
  await db.transaction(async (tx) => {
    for (const [, table] of [...TABLES].reverse()) await tx.delete(table);
    for (const [key, table] of TABLES) {
      const rows = backup.data[key].map((row) => {
        const out: Record<string, unknown> = { ...row };
        for (const f of DATE_FIELDS) if (typeof out[f] === "string") out[f] = new Date(out[f] as string);
        return out;
      });
      // Insert in chunks to stay below parameter limits.
      for (let i = 0; i < rows.length; i += 500) {
        await tx.insert(table).values(rows.slice(i, i + 500) as never);
      }
      const name = SQL_NAMES[key];
      await tx.execute(
        sql.raw(`SELECT setval(pg_get_serial_sequence('${name}', 'id'), COALESCE((SELECT MAX(id) FROM ${name}), 0) + 1, false)`),
      );
    }
  });
}
