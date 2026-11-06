import "server-only";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { listeners, nodes, profiles, proxyGroups, ruleProviders, rules, subscriptions, type Profile } from "@/db/schema";
import { generateConfig, type GenerateInput } from "@/lib/generator";
import type { UserInfo } from "@/lib/types";

export async function loadGenerateInput(db: Db, profile: Profile): Promise<GenerateInput> {
  const subIds = profile.subscriptionIds;
  const [subs, nodeRows, groups, providers, ruleRows, listenerRows] = await Promise.all([
    db.select().from(subscriptions).orderBy(asc(subscriptions.sort), asc(subscriptions.id)),
    db
      .select()
      .from(nodes)
      .where(subIds.length ? or(isNull(nodes.subscriptionId), inArray(nodes.subscriptionId, subIds)) : isNull(nodes.subscriptionId)),
    db.select().from(proxyGroups).where(eq(proxyGroups.profileId, profile.id)),
    db.select().from(ruleProviders),
    db.select().from(rules).where(eq(rules.profileId, profile.id)),
    db.select().from(listeners).orderBy(asc(listeners.sort), asc(listeners.id)),
  ]);
  return { profile, subscriptions: subs, nodes: nodeRows, groups, ruleProviders: providers, rules: ruleRows, listeners: listenerRows };
}

export async function generateForProfile(db: Db, profile: Profile) {
  const input = await loadGenerateInput(db, profile);
  return { input, result: generateConfig(input) };
}

/** Sums traffic of the profile's enabled subscriptions; expire is the earliest one. */
export function aggregateUserInfo(input: GenerateInput): UserInfo | null {
  const selected = new Set(input.profile.subscriptionIds);
  const infos = input.subscriptions.filter((s) => s.enabled && selected.has(s.id) && s.userinfo).map((s) => s.userinfo!);
  if (!infos.length) return null;
  const expires = infos.map((i) => i.expire).filter((e): e is number => !!e);
  return {
    upload: infos.reduce((a, i) => a + i.upload, 0),
    download: infos.reduce((a, i) => a + i.download, 0),
    total: infos.reduce((a, i) => a + i.total, 0),
    ...(expires.length ? { expire: Math.min(...expires) } : {}),
  };
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Ids of listeners selected by this profile and by no other, which are safe to rewrite on rename. */
async function exclusiveListenerIds(tx: Tx, profileId: number) {
  const all = await tx.select({ id: profiles.id, listenerIds: profiles.listenerIds }).from(profiles);
  const mine = all.find((p) => p.id === profileId)?.listenerIds ?? [];
  const others = new Set(all.filter((p) => p.id !== profileId).flatMap((p) => p.listenerIds));
  return mine.filter((id) => !others.has(id));
}

/**
 * Renames a proxy group and every reference to it within the profile, atomically. Shared listeners
 * are left untouched so other profiles keep working; generation reports them if they now dangle.
 */
export async function renameGroup(db: Db, profileId: number, from: string, to: string) {
  if (from === to) return;
  await db.transaction(async (tx) => {
    await tx.update(proxyGroups).set({ name: to }).where(and(eq(proxyGroups.profileId, profileId), eq(proxyGroups.name, from)));
    const groups = await tx.select().from(proxyGroups).where(eq(proxyGroups.profileId, profileId));
    for (const g of groups) {
      if (!g.members.items.includes(from)) continue;
      const items = g.members.items.map((i) => (i === from ? to : i));
      await tx.update(proxyGroups).set({ members: { ...g.members, items } }).where(eq(proxyGroups.id, g.id));
    }
    await tx
      .update(rules)
      .set({ target: to })
      .where(and(eq(rules.profileId, profileId), eq(rules.target, from), sql`${rules.type} <> 'SUB-RULE'`));
    const ids = await exclusiveListenerIds(tx, profileId);
    if (ids.length) await tx.update(listeners).set({ proxy: to }).where(and(inArray(listeners.id, ids), eq(listeners.proxy, from)));
  });
}

/** Renames a sub-rule set: its rules, SUB-RULE references and exclusive listener routing, atomically. */
export async function renameSubRule(db: Db, profileId: number, from: string, to: string) {
  if (from === to) return;
  await db.transaction(async (tx) => {
    await tx.update(rules).set({ subRule: to }).where(and(eq(rules.profileId, profileId), eq(rules.subRule, from)));
    await tx
      .update(rules)
      .set({ target: to })
      .where(and(eq(rules.profileId, profileId), eq(rules.type, "SUB-RULE"), eq(rules.target, from)));
    const ids = await exclusiveListenerIds(tx, profileId);
    if (ids.length) await tx.update(listeners).set({ subRule: to }).where(and(inArray(listeners.id, ids), eq(listeners.subRule, from)));
  });
}

/** Listeners selected by the profile that route to the given group / sub-rule name. */
export async function listenersReferencing(db: Db, profileId: number, field: "proxy" | "subRule", name: string) {
  const [p] = await db.select({ listenerIds: profiles.listenerIds }).from(profiles).where(eq(profiles.id, profileId));
  if (!p?.listenerIds.length) return [];
  return db
    .select({ name: listeners.name })
    .from(listeners)
    .where(and(inArray(listeners.id, p.listenerIds), eq(listeners[field], name)));
}
