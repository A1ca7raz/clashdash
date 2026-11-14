import "server-only";
import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import {
  listeners,
  nodes,
  profileListeners,
  profileManualNodes,
  profileSubscriptions,
  proxyGroups,
  ruleProviders,
  rules,
  subscriptions,
  type Profile,
} from "@/db/schema";
import { generateConfig, type GenerateInput } from "@/lib/generator";
import { updateGroupItemsYaml } from "@/lib/group-config";
import { updateListenerYaml } from "@/lib/listener-config";
import { BUILTIN_POLICIES, type MihomoProxy, type ProfileResourceSelection, type UserInfo } from "@/lib/types";
import { loadYamlPointers, syncPointerReferences } from "@/server/pointer-references";

export type ProfileWithResources = Profile & ProfileResourceSelection;

export async function loadProfileResources(db: Db, profileId: number): Promise<ProfileResourceSelection> {
  const [subscriptionRows, manualRows, listenerRows] = await Promise.all([
    db
      .select({ id: profileSubscriptions.subscriptionId })
      .from(profileSubscriptions)
      .where(eq(profileSubscriptions.profileId, profileId))
      .orderBy(asc(profileSubscriptions.sort), asc(profileSubscriptions.subscriptionId)),
    db
      .select({ id: profileManualNodes.nodeId })
      .from(profileManualNodes)
      .where(eq(profileManualNodes.profileId, profileId))
      .orderBy(asc(profileManualNodes.sort), asc(profileManualNodes.nodeId)),
    db
      .select({ id: profileListeners.listenerId })
      .from(profileListeners)
      .where(eq(profileListeners.profileId, profileId))
      .orderBy(asc(profileListeners.sort), asc(profileListeners.listenerId)),
  ]);
  return {
    subscriptionIds: subscriptionRows.map((r) => r.id),
    manualNodeIds: manualRows.map((r) => r.id),
    listenerIds: listenerRows.map((r) => r.id),
  };
}

export async function loadGenerateInput(db: Db, profile: Profile): Promise<GenerateInput> {
  const resources = await loadProfileResources(db, profile.id);
  const subIds = resources.subscriptionIds;
  const [subs, nodeRows, groups, providers, ruleRows, listenerRows, pointers] = await Promise.all([
    db.select().from(subscriptions).orderBy(asc(subscriptions.sort), asc(subscriptions.id)),
    db
      .select()
      .from(nodes)
      .where(subIds.length ? or(isNull(nodes.subscriptionId), inArray(nodes.subscriptionId, subIds)) : isNull(nodes.subscriptionId)),
    db.select().from(proxyGroups).where(eq(proxyGroups.profileId, profile.id)),
    db.select().from(ruleProviders),
    db.select().from(rules).where(eq(rules.profileId, profile.id)),
    db.select().from(listeners).orderBy(asc(listeners.sort), asc(listeners.id)),
    loadYamlPointers(db),
  ]);
  return {
    profile: { ...profile, ...resources },
    pointers,
    subscriptions: subs,
    nodes: nodeRows,
    groups,
    ruleProviders: providers,
    rules: ruleRows,
    listeners: listenerRows,
  };
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

function availableListenerName(base: string, taken: Set<string>): string {
  let name = base;
  for (let i = 2; taken.has(name); i++) name = `${base} ${i}`;
  taken.add(name);
  return name;
}

async function rerouteListeners(tx: Tx, profileId: number, field: "proxy" | "subRule", from: string, to: string) {
  const selected = await tx
    .select({ listener: listeners })
    .from(profileListeners)
    .innerJoin(listeners, eq(listeners.id, profileListeners.listenerId))
    .where(and(eq(profileListeners.profileId, profileId), eq(listeners[field], from)))
    .orderBy(asc(profileListeners.sort), asc(profileListeners.listenerId));
  if (!selected.length) return;
  const taken = new Set((await tx.select({ name: listeners.name }).from(listeners)).map((l) => l.name));

  for (const { listener } of selected) {
    const shared = await tx.$count(
      profileListeners,
      and(eq(profileListeners.listenerId, listener.id), ne(profileListeners.profileId, profileId)),
    );
    const route = field === "proxy" ? { proxy: to } : { subRule: to };
    if (!shared) {
      const yaml = listener.yaml ? updateListenerYaml(listener.yaml, route) : null;
      await tx
        .update(listeners)
        .set({ [field]: to, yaml })
        .where(eq(listeners.id, listener.id));
      if (yaml) await syncPointerReferences(tx, "listener", listener.id, yaml);
      continue;
    }

    const name = availableListenerName(`${listener.name} 副本`, taken);
    const yaml = listener.yaml ? updateListenerYaml(listener.yaml, { name, ...route }) : null;
    const [copy] = await tx
      .insert(listeners)
      .values({
        name,
        type: listener.type,
        listen: listener.listen,
        port: listener.port,
        proxy: listener.proxy,
        subRule: listener.subRule,
        options: listener.options,
        enabled: listener.enabled,
        sort: await tx.$count(listeners),
        yaml,
        [field]: to,
      })
      .returning();
    if (yaml) await syncPointerReferences(tx, "listener", copy.id, yaml);
    await tx
      .update(profileListeners)
      .set({ listenerId: copy.id })
      .where(and(eq(profileListeners.profileId, profileId), eq(profileListeners.listenerId, listener.id)));
  }
}

/** Renames a proxy group and its references; shared listeners are copied for this profile. */
export async function renameGroup(db: Db, profileId: number, from: string, to: string) {
  if (from === to) return;
  await db.transaction(async (tx) => {
    await tx.update(proxyGroups).set({ name: to }).where(and(eq(proxyGroups.profileId, profileId), eq(proxyGroups.name, from)));
    const groups = await tx.select().from(proxyGroups).where(eq(proxyGroups.profileId, profileId));
    for (const g of groups) {
      if (!g.members.items.includes(from)) continue;
      const items = g.members.items.map((i) => (i === from ? to : i));
      const yaml = g.yaml ? updateGroupItemsYaml(g.yaml, from, to) : null;
      await tx.update(proxyGroups).set({ members: { ...g.members, items }, yaml }).where(eq(proxyGroups.id, g.id));
      if (yaml) await syncPointerReferences(tx, "group", g.id, yaml);
    }
    await tx
      .update(rules)
      .set({ target: to })
      .where(and(eq(rules.profileId, profileId), eq(rules.target, from), sql`${rules.type} <> 'SUB-RULE'`));
    await rerouteListeners(tx, profileId, "proxy", from, to);
  });
}

/** Renames a sub-rule set and its references; shared listeners are copied for this profile. */
export async function renameSubRule(db: Db, profileId: number, from: string, to: string) {
  if (from === to) return;
  await db.transaction(async (tx) => {
    await tx.update(rules).set({ subRule: to }).where(and(eq(rules.profileId, profileId), eq(rules.subRule, from)));
    await tx
      .update(rules)
      .set({ target: to })
      .where(and(eq(rules.profileId, profileId), eq(rules.type, "SUB-RULE"), eq(rules.target, from)));
    await rerouteListeners(tx, profileId, "subRule", from, to);
  });
}

/** Listeners selected by the profile that route to the given group / sub-rule name. */
export async function listenersReferencing(db: Db, profileId: number, field: "proxy" | "subRule", name: string) {
  return db
    .select({ name: listeners.name })
    .from(profileListeners)
    .innerJoin(listeners, eq(listeners.id, profileListeners.listenerId))
    .where(and(eq(profileListeners.profileId, profileId), eq(listeners[field], name)));
}

export async function updateManualNodeConfig(db: Db, id: number, config: MihomoProxy, yaml: string) {
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(nodes).where(and(eq(nodes.id, id), isNull(nodes.subscriptionId)));
    if (!before) throw new Error("手动节点不存在");
    if (before.name !== config.name) {
      const conflict =
        (BUILTIN_POLICIES as readonly string[]).includes(config.name) ||
        (await tx.$count(nodes, and(eq(nodes.name, config.name), ne(nodes.id, id)))) > 0 ||
        (await tx.$count(proxyGroups, eq(proxyGroups.name, config.name))) > 0;
      if (conflict) throw new Error("节点名称与现有节点、代理组或内置策略冲突");

      const groups = await tx.select().from(proxyGroups);
      for (const group of groups) {
        if (!group.members.items.includes(before.name)) continue;
        const items = group.members.items.map((item) => (item === before.name ? config.name : item));
        const groupYaml = group.yaml ? updateGroupItemsYaml(group.yaml, before.name, config.name) : null;
        await tx.update(proxyGroups).set({ members: { ...group.members, items }, yaml: groupYaml }).where(eq(proxyGroups.id, group.id));
        if (groupYaml) await syncPointerReferences(tx, "group", group.id, groupYaml);
      }
      await tx.update(rules).set({ target: config.name }).where(and(eq(rules.target, before.name), sql`${rules.type} <> 'SUB-RULE'`));
      const linkedListeners = await tx.select().from(listeners).where(eq(listeners.proxy, before.name));
      for (const listener of linkedListeners) {
        const listenerYaml = listener.yaml ? updateListenerYaml(listener.yaml, { proxy: config.name }) : null;
        await tx.update(listeners).set({ proxy: config.name, yaml: listenerYaml }).where(eq(listeners.id, listener.id));
        if (listenerYaml) await syncPointerReferences(tx, "listener", listener.id, listenerYaml);
      }
    }
    await tx.update(nodes).set({ name: config.name, type: config.type, config, yaml }).where(eq(nodes.id, id));
    await syncPointerReferences(tx, "node", id, yaml);
  });
}
