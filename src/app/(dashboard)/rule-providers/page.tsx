import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ruleProviders, rules } from "@/db/schema";
import { loadYamlPointers } from "@/server/pointer-references";
import { RuleProvidersClient } from "./rule-providers-client";

export default async function RuleProvidersPage() {
  const db = await getDb();
  const [rows, usage, pointers] = await Promise.all([
    db.select().from(ruleProviders).orderBy(asc(ruleProviders.name)),
    db
      .select({ name: rules.payload, count: sql<number>`count(*)::int` })
      .from(rules)
      .where(eq(rules.type, "RULE-SET"))
      .groupBy(rules.payload),
    loadYamlPointers(db),
  ]);
  return (
    <RuleProvidersClient providers={rows} usage={Object.fromEntries(usage.map((u) => [u.name, u.count]))} pointers={pointers} />
  );
}
