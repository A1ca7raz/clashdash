"use server";

import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Db } from "@/db";
import { profiles, proxyGroups, rules, subscriptions } from "@/db/schema";
import { checkBaseConfig, DEFAULT_BASE_CONFIG } from "@/lib/base-config";
import { validateFilter } from "@/lib/regex";
import { parseRuleLines } from "@/lib/rule-line";
import { GROUP_TYPES, RULE_TYPES } from "@/lib/types";
import { applyPreset } from "@/server/presets";
import { generateForProfile, listenersReferencing, renameGroup, renameSubRule } from "@/server/profile-data";
import { run } from "./common";

const done = () => revalidatePath("/", "layout");
const newToken = () => nanoid(32);

// Profiles

export async function createProfile(input: { name: string; preset: boolean }) {
  return run(async (db) => {
    const name = z.string().trim().min(1, "名称不能为空").parse(input.name);
    const subIds = (await db.select({ id: subscriptions.id }).from(subscriptions).orderBy(asc(subscriptions.sort))).map((s) => s.id);
    const count = await db.$count(profiles);
    const [row] = await db
      .insert(profiles)
      .values({ name, token: newToken(), baseConfig: DEFAULT_BASE_CONFIG, subscriptionIds: subIds, sort: count })
      .returning();
    if (input.preset) await applyPreset(db, row.id);
    done();
    return row.id;
  });
}

const settingsSchema = z.object({
  id: z.number().int(),
  name: z.string().trim().min(1, "名称不能为空"),
  subscriptionIds: z.array(z.number().int()),
  manualNodeIds: z.array(z.number().int()),
  listenerIds: z.array(z.number().int()),
  updateInterval: z.number().int().min(1).max(720),
});

export async function updateProfileSettings(input: z.input<typeof settingsSchema>) {
  return run(async (db) => {
    const { id, ...v } = settingsSchema.parse(input);
    await db.update(profiles).set({ ...v, updatedAt: new Date() }).where(eq(profiles.id, id));
    done();
  });
}

export async function saveBaseConfig(id: number, text: string) {
  return run(async (db) => {
    const check = checkBaseConfig(text);
    if (check.errors.length) throw new Error(check.errors.join("；"));
    await db.update(profiles).set({ baseConfig: text, updatedAt: new Date() }).where(eq(profiles.id, id));
    done();
  });
}

export async function resetProfileToken(id: number) {
  return run(async (db) => {
    await db.update(profiles).set({ token: newToken() }).where(eq(profiles.id, id));
    done();
  });
}

export async function deleteProfile(id: number) {
  return run(async (db) => {
    await db.delete(profiles).where(eq(profiles.id, id));
    done();
  });
}

export async function applyProfilePreset(id: number) {
  return run(async (db) => {
    await applyPreset(db, id);
    done();
  });
}

export async function previewProfile(id: number) {
  return run(async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, id));
    if (!profile) throw new Error("配置方案不存在");
    const { result } = await generateForProfile(db, profile);
    return result;
  });
}

// Ordering (groups, rules, listeners)

const ORDERABLE = { groups: proxyGroups, rules } as const;

export async function reorder(kind: keyof typeof ORDERABLE, profileId: number, ids: number[]) {
  return run(async (db) => {
    const table = ORDERABLE[kind];
    await db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx.update(table).set({ sort: i }).where(and(eq(table.id, id), eq(table.profileId, profileId)));
      }
    });
    done();
  });
}

// Proxy groups

const groupSchema = z.object({
  id: z.number().int().optional(),
  profileId: z.number().int(),
  name: z.string().trim().min(1, "名称不能为空").regex(/^[^,]+$/, "名称不能包含逗号"),
  type: z.enum(GROUP_TYPES),
  options: z.object({
    url: z.string().optional(),
    interval: z.number().int().positive().optional(),
    tolerance: z.number().int().min(0).optional(),
    timeout: z.number().int().positive().optional(),
    lazy: z.boolean().optional(),
    strategy: z.enum(["consistent-hashing", "round-robin", "sticky-sessions"]).optional(),
    hidden: z.boolean().optional(),
    icon: z.string().optional(),
    disableUdp: z.boolean().optional(),
  }),
  members: z.object({
    items: z.array(z.string()),
    sources: z.object({ all: z.boolean(), subscriptions: z.array(z.number().int()), manual: z.boolean() }),
    include: z.string().optional(),
    exclude: z.string().optional(),
  }),
});

export type GroupInput = z.input<typeof groupSchema>;

export async function saveGroup(input: GroupInput) {
  return run(async (db) => {
    const v = groupSchema.parse(input);
    const members = {
      ...v.members,
      include: v.members.include?.trim() || undefined,
      exclude: v.members.exclude?.trim() || undefined,
    };
    for (const [label, f] of [["包含过滤", members.include], ["排除过滤", members.exclude]] as const) {
      const err = f && validateFilter(f);
      if (err) throw new Error(`${label}：${err}`);
    }
    if (v.id) {
      const [before] = await db.select().from(proxyGroups).where(eq(proxyGroups.id, v.id));
      if (!before) throw new Error("代理组不存在");
      if (before.name !== v.name) await renameGroup(db, v.profileId, before.name, v.name);
      await db.update(proxyGroups).set({ type: v.type, options: v.options, members }).where(eq(proxyGroups.id, v.id));
    } else {
      const count = await db.$count(proxyGroups, eq(proxyGroups.profileId, v.profileId));
      await db.insert(proxyGroups).values({ ...v, members, sort: count });
    }
    done();
  });
}

export async function deleteGroup(id: number) {
  return run(async (db) => {
    const [g] = await db.select().from(proxyGroups).where(eq(proxyGroups.id, id));
    if (!g) return;
    const refs: string[] = [];
    const others = await db.select().from(proxyGroups).where(and(eq(proxyGroups.profileId, g.profileId), ne(proxyGroups.id, id)));
    for (const o of others) if (o.members.items.includes(g.name)) refs.push(`代理组「${o.name}」`);
    const ruleRefs = await db.$count(
      rules,
      and(eq(rules.profileId, g.profileId), eq(rules.target, g.name), sql`${rules.type} <> 'SUB-RULE'`),
    );
    if (ruleRefs) refs.push(`${ruleRefs} 条规则`);
    for (const l of await listenersReferencing(db, g.profileId, "proxy", g.name)) refs.push(`监听器「${l.name}」`);
    if (refs.length) throw new Error(`代理组「${g.name}」仍被引用：${refs.join("、")}`);
    await db.delete(proxyGroups).where(eq(proxyGroups.id, id));
    done();
  });
}

// Rules

const ruleSchema = z.object({
  id: z.number().int().optional(),
  profileId: z.number().int(),
  subRule: z.string().trim().min(1).nullable(),
  type: z.enum(RULE_TYPES),
  payload: z.string().trim(),
  target: z.string().trim().min(1, "目标不能为空"),
  noResolve: z.boolean(),
  enabled: z.boolean(),
  remark: z.string().nullable().optional(),
});

export type RuleInput = z.input<typeof ruleSchema>;

function inSet(profileId: number, subRule: string | null) {
  return and(eq(rules.profileId, profileId), subRule ? eq(rules.subRule, subRule) : isNull(rules.subRule));
}

/** Appends rules to a set, keeping a trailing MATCH last. */
async function appendRules(db: Db, profileId: number, subRule: string | null, items: Omit<RuleInput, "profileId" | "subRule">[]) {
  const existing = await db.select().from(rules).where(inSet(profileId, subRule)).orderBy(asc(rules.sort), asc(rules.id));
  const last = existing[existing.length - 1];
  const keepLast = last?.type === "MATCH" && items.every((i) => i.type !== "MATCH");
  const head = keepLast ? existing.slice(0, -1) : existing;
  await db.transaction(async (tx) => {
    let sort = head.length;
    await tx.insert(rules).values(
      items.map((i) => ({ ...i, payload: i.type === "MATCH" ? "" : i.payload, profileId, subRule, sort: sort++ })),
    );
    if (keepLast) await tx.update(rules).set({ sort }).where(eq(rules.id, last.id));
  });
}

export async function saveRule(input: RuleInput) {
  return run(async (db) => {
    const v = ruleSchema.parse(input);
    const values = { ...v, payload: v.type === "MATCH" ? "" : v.payload, remark: v.remark || null };
    if (v.type !== "MATCH" && !values.payload) throw new Error("规则内容不能为空");
    if (v.id) {
      await db.update(rules).set(values).where(eq(rules.id, v.id));
    } else {
      await appendRules(db, v.profileId, v.subRule, [values]);
    }
    done();
  });
}

export async function setRuleEnabled(id: number, enabled: boolean) {
  return run(async (db) => {
    await db.update(rules).set({ enabled }).where(eq(rules.id, id));
    done();
  });
}

export async function deleteRule(id: number) {
  return run(async (db) => {
    await db.delete(rules).where(eq(rules.id, id));
    done();
  });
}

export async function bulkAddRules(profileId: number, subRule: string | null, text: string) {
  return run(async (db) => {
    const { rules: parsed, errors } = parseRuleLines(text);
    if (errors.length) throw new Error(errors.slice(0, 5).join("；"));
    if (!parsed.length) throw new Error("没有可导入的规则");
    await appendRules(
      db,
      profileId,
      subRule,
      parsed.map((r) => ({ ...r, type: r.type as RuleInput["type"], enabled: true })),
    );
    done();
    return parsed.length;
  });
}

const subRuleName = z.string().trim().min(1, "名称不能为空").regex(/^[^,\s]+$/, "名称不能包含逗号或空白");

export async function createSubRule(profileId: number, name: string) {
  return run(async (db) => {
    const n = subRuleName.parse(name);
    if (await db.$count(rules, and(eq(rules.profileId, profileId), eq(rules.subRule, n)))) throw new Error("子规则已存在");
    // A set exists through its rules; seed it with a MATCH so it's complete.
    await db.insert(rules).values({ profileId, subRule: n, type: "MATCH", payload: "", target: "DIRECT", sort: 0 });
    done();
    return n;
  });
}

export async function renameSubRuleAction(profileId: number, from: string, to: string) {
  return run(async (db) => {
    const n = subRuleName.parse(to);
    if (n !== from && (await db.$count(rules, and(eq(rules.profileId, profileId), eq(rules.subRule, n))))) {
      throw new Error("子规则已存在");
    }
    await renameSubRule(db, profileId, from, n);
    done();
    return n;
  });
}

export async function deleteSubRule(profileId: number, name: string) {
  return run(async (db) => {
    const refs = await db.$count(rules, and(eq(rules.profileId, profileId), eq(rules.type, "SUB-RULE"), eq(rules.target, name)));
    const lRefs = (await listenersReferencing(db, profileId, "subRule", name)).length;
    if (refs || lRefs) throw new Error(`子规则「${name}」仍被 ${refs} 条规则、${lRefs} 个监听器引用`);
    await db.delete(rules).where(and(eq(rules.profileId, profileId), eq(rules.subRule, name)));
    done();
  });
}