"use server";

import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Db } from "@/db";
import { profileListeners, profileManualNodes, profileSubscriptions, profiles, proxyGroups, rules, subscriptions } from "@/db/schema";
import { checkBaseConfig, DEFAULT_BASE_CONFIG } from "@/lib/base-config";
import { parseGroupConfig } from "@/lib/group-config";
import { validateFilter } from "@/lib/regex";
import { parseRuleLines } from "@/lib/rule-line";
import { DIVIDER_RULE_TYPE, EDITOR_RULE_TYPES, type GroupMembers } from "@/lib/types";
import { clearPointerReferences, loadYamlPointers, syncPointerReferences } from "@/server/pointer-references";
import { generateForProfile, listenersReferencing, renameGroup, renameSubRule } from "@/server/profile-data";
import { run } from "./common";

const done = () => revalidatePath("/", "layout");
const newToken = () => nanoid(32);

// Profiles

export async function createProfile(input: { name: string }) {
  return run(async (db) => {
    const name = z.string().trim().min(1, "名称不能为空").parse(input.name);
    const subIds = (await db.select({ id: subscriptions.id }).from(subscriptions).orderBy(asc(subscriptions.sort))).map((s) => s.id);
    const row = await db.transaction(async (tx) => {
      const count = await tx.$count(profiles);
      const [created] = await tx
        .insert(profiles)
        .values({ name, token: newToken(), baseConfig: DEFAULT_BASE_CONFIG, sort: count })
        .returning();
      if (subIds.length) {
        await tx.insert(profileSubscriptions).values(subIds.map((subscriptionId, sort) => ({ profileId: created.id, subscriptionId, sort })));
      }
      return created;
    });
    done();
    return row.id;
  });
}

const settingsSchema = z.object({
  id: z.number().int(),
  name: z.string().trim().min(1, "名称不能为空"),
  updateInterval: z.number().int().min(1).max(720),
});

export async function updateProfileSettings(input: z.input<typeof settingsSchema>) {
  return run(async (db) => {
    const { id, ...v } = settingsSchema.parse(input);
    await db.update(profiles).set({ ...v, updatedAt: new Date() }).where(eq(profiles.id, id));
    done();
  });
}

const resourcesSchema = z.object({
  id: z.number().int(),
  subscriptionIds: z.array(z.number().int()),
  manualNodeIds: z.array(z.number().int()),
  listenerIds: z.array(z.number().int()),
});

export async function updateProfileResources(input: z.input<typeof resourcesSchema>) {
  return run(async (db) => {
    const { id, subscriptionIds, manualNodeIds, listenerIds } = resourcesSchema.parse(input);
    await db.transaction(async (tx) => {
      await tx.delete(profileSubscriptions).where(eq(profileSubscriptions.profileId, id));
      await tx.delete(profileManualNodes).where(eq(profileManualNodes.profileId, id));
      await tx.delete(profileListeners).where(eq(profileListeners.profileId, id));
      if (subscriptionIds.length) {
        await tx.insert(profileSubscriptions).values(subscriptionIds.map((subscriptionId, sort) => ({ profileId: id, subscriptionId, sort })));
      }
      if (manualNodeIds.length) {
        await tx.insert(profileManualNodes).values(manualNodeIds.map((nodeId, sort) => ({ profileId: id, nodeId, sort })));
      }
      if (listenerIds.length) {
        await tx.insert(profileListeners).values(listenerIds.map((listenerId, sort) => ({ profileId: id, listenerId, sort })));
      }
      await tx.update(profiles).set({ updatedAt: new Date() }).where(eq(profiles.id, id));
    });
    done();
  });
}

export async function saveBaseConfig(id: number, text: string) {
  return run(async (db) => {
    const pointers = await loadYamlPointers(db);
    const check = checkBaseConfig(text, pointers);
    if (check.errors.length) throw new Error(check.errors.join("；"));
    await db.transaction(async (tx) => {
      await tx.update(profiles).set({ baseConfig: text, updatedAt: new Date() }).where(eq(profiles.id, id));
      await syncPointerReferences(tx, "profile", id, text);
    });
    done();
  });
}

export async function resetProfileToken(id: number) {
  return run(async (db) => {
    await db.update(profiles).set({ token: newToken() }).where(eq(profiles.id, id));
    done();
  });
}

const profileIdsSchema = z.array(z.number().int()).min(1);

async function removeProfiles(db: Db, ids: number[]) {
  const uniqueIds = [...new Set(profileIdsSchema.parse(ids))];
  const count = await db.transaction(async (tx) => {
    const groups = await tx.select({ id: proxyGroups.id }).from(proxyGroups).where(inArray(proxyGroups.profileId, uniqueIds));
    const deleted = await tx.delete(profiles).where(inArray(profiles.id, uniqueIds)).returning({ id: profiles.id });
    if (groups.length) await clearPointerReferences(tx, "group", groups.map((group) => group.id));
    if (deleted.length) await clearPointerReferences(tx, "profile", deleted.map((profile) => profile.id));
    return deleted.length;
  });
  done();
  return count;
}

export async function deleteProfiles(ids: number[]) {
  return run((db) => removeProfiles(db, ids));
}

export async function deleteProfile(id: number) {
  return run(async (db) => {
    await removeProfiles(db, [id]);
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

export async function saveGroup(profileId: number, yamlText: string, id?: number) {
  return run(async (db) => {
    const pointers = await loadYamlPointers(db);
    const v = parseGroupConfig(yamlText, pointers);
    const selected = await db
      .select({ id: subscriptions.id, name: subscriptions.name })
      .from(profileSubscriptions)
      .innerJoin(subscriptions, eq(subscriptions.id, profileSubscriptions.subscriptionId))
      .where(eq(profileSubscriptions.profileId, profileId));
    const subscriptionIds = new Map(selected.map((s) => [s.name, s.id]));
    const selectedNames = v.members.sources.all ? [] : v.members.sources.subscriptions;
    const missing = selectedNames.find((name) => !subscriptionIds.has(name));
    if (missing) throw new Error(`订阅「${missing}」不存在或未加入当前方案`);

    const members: GroupMembers = {
      ...v.members,
      sources: {
        ...v.members.sources,
        subscriptions: selectedNames.map((name) => subscriptionIds.get(name)!),
      },
      include: v.members.include?.trim() || undefined,
      exclude: v.members.exclude?.trim() || undefined,
    };
    for (const [label, f] of [["包含过滤", members.include], ["排除过滤", members.exclude]] as const) {
      const err = f && validateFilter(f);
      if (err) throw new Error(`${label}：${err}`);
    }
    await db.transaction(async (tx) => {
      const [saved] = id
        ? await (async () => {
            const [before] = await tx.select().from(proxyGroups).where(eq(proxyGroups.id, id));
            if (!before) throw new Error("代理组不存在");
            if (before.name !== v.name) await renameGroup(tx, profileId, before.name, v.name);
            return tx
              .update(proxyGroups)
              .set({ type: v.type, options: v.options, members, yaml: yamlText })
              .where(eq(proxyGroups.id, id))
              .returning({ id: proxyGroups.id });
          })()
        : await tx
            .insert(proxyGroups)
            .values({
              profileId,
              name: v.name,
              type: v.type,
              options: v.options,
              members,
              yaml: yamlText,
              sort: await tx.$count(proxyGroups, eq(proxyGroups.profileId, profileId)),
            })
            .returning({ id: proxyGroups.id });
      await syncPointerReferences(tx, "group", saved.id, yamlText);
    });
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
    await db.transaction(async (tx) => {
      await tx.delete(proxyGroups).where(eq(proxyGroups.id, id));
      await clearPointerReferences(tx, "group", [id]);
    });
    done();
  });
}

// Rules

const ruleSchema = z.object({
  id: z.number().int().optional(),
  profileId: z.number().int(),
  subRule: z.string().trim().min(1).nullable(),
  type: z.enum(EDITOR_RULE_TYPES),
  payload: z.string().trim(),
  target: z.string().trim(),
  noResolve: z.boolean(),
  enabled: z.boolean(),
  remark: z.string().nullable().optional(),
});

export type RuleInput = z.input<typeof ruleSchema>;

function inSet(profileId: number, subRule: string | null) {
  return and(eq(rules.profileId, profileId), subRule ? eq(rules.subRule, subRule) : isNull(rules.subRule));
}

/** Appends rules before a trailing MATCH and any dividers that follow it. */
async function appendRules(db: Db, profileId: number, subRule: string | null, items: Omit<RuleInput, "profileId" | "subRule">[]) {
  const existing = await db.select().from(rules).where(inSet(profileId, subRule)).orderBy(asc(rules.sort), asc(rules.id));
  let lastRealIndex = -1;
  for (let i = existing.length - 1; i >= 0; i--) {
    if (existing[i].type !== DIVIDER_RULE_TYPE) {
      lastRealIndex = i;
      break;
    }
  }
  const keepTail = existing[lastRealIndex]?.type === "MATCH" && items.every((i) => i.type !== "MATCH");
  const tail = keepTail ? existing.slice(lastRealIndex) : [];
  await db.transaction(async (tx) => {
    let sort = keepTail ? lastRealIndex : existing.length;
    await tx.insert(rules).values(
      items.map((i) => ({
        ...i,
        payload: i.type === "MATCH" ? "" : i.payload,
        target: i.type === DIVIDER_RULE_TYPE ? "" : i.target,
        noResolve: i.type === DIVIDER_RULE_TYPE ? false : i.noResolve,
        profileId,
        subRule,
        sort: sort++,
      })),
    );
    for (const row of tail) await tx.update(rules).set({ sort: sort++ }).where(eq(rules.id, row.id));
  });
}

export async function saveRule(input: RuleInput) {
  return run(async (db) => {
    const v = ruleSchema.parse(input);
    const values = {
      ...v,
      payload: v.type === "MATCH" ? "" : v.payload,
      target: v.type === DIVIDER_RULE_TYPE ? "" : v.target,
      noResolve: v.type === DIVIDER_RULE_TYPE ? false : v.noResolve,
      remark: v.remark || null,
    };
    if (v.type !== DIVIDER_RULE_TYPE && !values.target) throw new Error("目标不能为空");
    if (v.type !== "MATCH" && v.type !== DIVIDER_RULE_TYPE && !values.payload) throw new Error("规则内容不能为空");
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