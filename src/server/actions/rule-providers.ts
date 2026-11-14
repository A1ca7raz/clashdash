"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Db } from "@/db";
import { ruleProviders, rules } from "@/db/schema";
import { parseRuleProviderConfig } from "@/lib/rule-provider-config";
import { clearPointerReferences, loadYamlPointers, syncPointerReferences } from "@/server/pointer-references";
import { run } from "./common";

const batchIdsSchema = z.array(z.number().int()).min(1).transform((ids) => [...new Set(ids)]);

export async function saveRuleProvider(yamlText: string, id?: number) {
  return run(async (db) => {
    const pointers = await loadYamlPointers(db);
    const values = parseRuleProviderConfig(yamlText, pointers);
    await db.transaction(async (tx) => {
      const [before] = id ? await tx.select().from(ruleProviders).where(eq(ruleProviders.id, id)) : [];
      const [saved] = id
        ? await tx
            .update(ruleProviders)
            .set({ ...values, yaml: yamlText })
            .where(eq(ruleProviders.id, id))
            .returning({ id: ruleProviders.id })
        : await tx
            .insert(ruleProviders)
            .values({ ...values, yaml: yamlText })
            .returning({ id: ruleProviders.id });
      if (before && before.name !== values.name) {
        await tx
          .update(rules)
          .set({ payload: values.name })
          .where(and(eq(rules.type, "RULE-SET"), eq(rules.payload, before.name)));
      }
      if (saved) await syncPointerReferences(tx, "ruleProvider", saved.id, yamlText);
    });
    revalidatePath("/", "layout");
  });
}

async function removeRuleProviders(db: Db, ids: number[]) {
  return db.transaction(async (tx) => {
    const selected = await tx
      .select({ id: ruleProviders.id, name: ruleProviders.name })
      .from(ruleProviders)
      .where(inArray(ruleProviders.id, ids));
    if (selected.length) {
      const names = selected.map((p) => p.name);
      const references = await tx
        .select({ name: rules.payload })
        .from(rules)
        .where(and(eq(rules.type, "RULE-SET"), inArray(rules.payload, names)));
      if (references.length) {
        const counts = new Map<string, number>();
        for (const reference of references) counts.set(reference.name, (counts.get(reference.name) ?? 0) + 1);
        throw new Error(
          names
            .filter((name) => counts.has(name))
            .map((name) => `规则集「${name}」仍被 ${counts.get(name)} 条规则引用`)
            .join("；"),
        );
      }
    }
    const deleted = await tx.delete(ruleProviders).where(inArray(ruleProviders.id, ids)).returning({ id: ruleProviders.id });
    if (deleted.length) await clearPointerReferences(tx, "ruleProvider", deleted.map((row) => row.id));
    return deleted.length;
  });
}

export async function deleteRuleProviders(ids: number[]) {
  return run(async (db) => {
    const count = await removeRuleProviders(db, batchIdsSchema.parse(ids));
    revalidatePath("/", "layout");
    return count;
  });
}

export async function deleteRuleProvider(id: number) {
  return run(async (db) => {
    await removeRuleProviders(db, [id]);
    revalidatePath("/", "layout");
  });
}
