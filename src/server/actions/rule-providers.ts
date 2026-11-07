"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ruleProviders, rules } from "@/db/schema";
import { parseRuleProviderConfig } from "@/lib/rule-provider-config";
import { run } from "./common";

export async function saveRuleProvider(yamlText: string, id?: number) {
  return run(async (db) => {
    const values = parseRuleProviderConfig(yamlText);
    if (id) {
      const [before] = await db.select().from(ruleProviders).where(eq(ruleProviders.id, id));
      await db.transaction(async (tx) => {
        await tx.update(ruleProviders).set(values).where(eq(ruleProviders.id, id));
        if (before && before.name !== values.name) {
          await tx
            .update(rules)
            .set({ payload: values.name })
            .where(and(eq(rules.type, "RULE-SET"), eq(rules.payload, before.name)));
        }
      });
    } else {
      await db.insert(ruleProviders).values(values);
    }
    revalidatePath("/", "layout");
  });
}

export async function deleteRuleProvider(id: number) {
  return run(async (db) => {
    const [p] = await db.select().from(ruleProviders).where(eq(ruleProviders.id, id));
    if (!p) return;
    const used = await db.$count(rules, and(eq(rules.type, "RULE-SET"), eq(rules.payload, p.name)));
    if (used) throw new Error(`规则集「${p.name}」仍被 ${used} 条规则引用`);
    await db.delete(ruleProviders).where(eq(ruleProviders.id, id));
    revalidatePath("/", "layout");
  });
}
