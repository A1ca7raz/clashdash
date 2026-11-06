"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ruleProviders, rules } from "@/db/schema";
import { RULE_PROVIDER_BEHAVIORS, RULE_PROVIDER_FORMATS } from "@/lib/types";
import { run } from "./common";

const schema = z
  .object({
    id: z.number().int().optional(),
    name: z.string().trim().min(1, "不能为空").regex(/^[^,\s]+$/, "不能包含逗号或空白"),
    behavior: z.enum(RULE_PROVIDER_BEHAVIORS),
    format: z.enum(RULE_PROVIDER_FORMATS),
    url: z.string().trim().url("不是有效的地址"),
    interval: z.number().int().min(60),
  })
  .refine((v) => !(v.format === "mrs" && v.behavior === "classical"), { message: "mrs 格式不支持 classical 类型", path: ["format"] });

export type RuleProviderInput = z.input<typeof schema>;

export async function saveRuleProvider(input: RuleProviderInput) {
  return run(async (db) => {
    const v = schema.parse(input);
    if (v.id) {
      const [before] = await db.select().from(ruleProviders).where(eq(ruleProviders.id, v.id));
      await db.transaction(async (tx) => {
        await tx.update(ruleProviders).set(v).where(eq(ruleProviders.id, v.id!));
        if (before && before.name !== v.name) {
          await tx
            .update(rules)
            .set({ payload: v.name })
            .where(and(eq(rules.type, "RULE-SET"), eq(rules.payload, before.name)));
        }
      });
    } else {
      await db.insert(ruleProviders).values(v);
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
