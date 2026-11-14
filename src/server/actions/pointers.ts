"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Db } from "@/db";
import {
  listeners,
  nodes,
  pointerReferences,
  pointers,
  profileSubscriptions,
  profiles,
  proxyGroups,
  ruleProviders,
  subscriptions,
  type Pointer,
  type PointerResourceType,
} from "@/db/schema";
import { checkBaseConfig } from "@/lib/base-config";
import { parseGroupConfig } from "@/lib/group-config";
import { parseListenerConfig } from "@/lib/listener-config";
import { parseManualNodeConfig } from "@/lib/node-config";
import { parseRuleProviderConfig } from "@/lib/rule-provider-config";
import { parseProviderSubscription } from "@/lib/subscription-config";
import type { GroupMembers } from "@/lib/types";
import { materializeYamlPointer, parseYamlPointerValue, type YamlPointerDefinition } from "@/lib/yaml-pointer";
import { loadYamlPointers, syncPointerReferences } from "@/server/pointer-references";
import { run } from "./common";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const nameSchema = z
  .string()
  .trim()
  .min(1, "名称不能为空")
  .regex(/^[\p{L}][\p{L}\p{N}_-]*$/u, "名称须以字母或中文开头，且只能包含字母、中文、数字、_ 和 -");

export async function createPointer(name: string, yamlText: string) {
  return run(async (db) => {
    const values = { name: nameSchema.parse(name), value: parseYamlPointerValue(yamlText) };
    const [created] = await db.insert(pointers).values(values).returning({ id: pointers.id });
    revalidatePath("/", "layout");
    return created.id;
  });
}

export async function updatePointer(id: number, yamlText: string) {
  return run(async (db) => {
    await db.update(pointers).set({ value: parseYamlPointerValue(yamlText), updatedAt: new Date() }).where(eq(pointers.id, id));
    revalidatePath("/", "layout");
  });
}

function referenceIds(refs: { resourceType: PointerResourceType; resourceId: number }[], type: PointerResourceType) {
  return refs.filter((ref) => ref.resourceType === type).map((ref) => ref.resourceId);
}

async function updateProfileReferences(
  tx: Tx,
  ids: number[],
  pointer: Pointer,
  available: YamlPointerDefinition[],
) {
  if (!ids.length) return;
  for (const row of await tx.select().from(profiles).where(inArray(profiles.id, ids))) {
    const yaml = materializeYamlPointer(row.baseConfig, pointer.name, pointer.value);
    const check = checkBaseConfig(yaml, available);
    if (check.errors.length) throw new Error(check.errors.join("；"));
    await tx.update(profiles).set({ baseConfig: yaml, updatedAt: new Date() }).where(eq(profiles.id, row.id));
    await syncPointerReferences(tx, "profile", row.id, yaml);
  }
}

async function updateNodeReferences(tx: Tx, ids: number[], pointer: Pointer, available: YamlPointerDefinition[]) {
  if (!ids.length) return;
  const rows = await tx.select().from(nodes).where(and(inArray(nodes.id, ids), isNull(nodes.subscriptionId)));
  for (const row of rows) {
    if (!row.yaml) continue;
    const yaml = materializeYamlPointer(row.yaml, pointer.name, pointer.value);
    const config = parseManualNodeConfig(yaml, available);
    await tx
      .update(nodes)
      .set({ name: config.name, type: config.type, config, yaml })
      .where(eq(nodes.id, row.id));
    await syncPointerReferences(tx, "node", row.id, yaml);
  }
}

async function updateListenerReferences(tx: Tx, ids: number[], pointer: Pointer, available: YamlPointerDefinition[]) {
  if (!ids.length) return;
  for (const row of await tx.select().from(listeners).where(inArray(listeners.id, ids))) {
    if (!row.yaml) continue;
    const yaml = materializeYamlPointer(row.yaml, pointer.name, pointer.value);
    const values = parseListenerConfig(yaml, available);
    await tx.update(listeners).set({ ...values, yaml }).where(eq(listeners.id, row.id));
    await syncPointerReferences(tx, "listener", row.id, yaml);
  }
}

async function updateGroupReferences(tx: Tx, ids: number[], pointer: Pointer, available: YamlPointerDefinition[]) {
  if (!ids.length) return;
  for (const row of await tx.select().from(proxyGroups).where(inArray(proxyGroups.id, ids))) {
    if (!row.yaml) continue;
    const yaml = materializeYamlPointer(row.yaml, pointer.name, pointer.value);
    const values = parseGroupConfig(yaml, available);
    const selected = await tx
      .select({ id: subscriptions.id, name: subscriptions.name })
      .from(profileSubscriptions)
      .innerJoin(subscriptions, eq(subscriptions.id, profileSubscriptions.subscriptionId))
      .where(eq(profileSubscriptions.profileId, row.profileId));
    const subscriptionIds = new Map(selected.map((subscription) => [subscription.name, subscription.id]));
    const selectedNames = values.members.sources.all ? [] : values.members.sources.subscriptions;
    const missing = selectedNames.find((name) => !subscriptionIds.has(name));
    if (missing) throw new Error(`订阅「${missing}」不存在或未加入当前方案`);
    const members: GroupMembers = {
      ...values.members,
      sources: {
        ...values.members.sources,
        subscriptions: selectedNames.map((name) => subscriptionIds.get(name)!),
      },
      include: values.members.include?.trim() || undefined,
      exclude: values.members.exclude?.trim() || undefined,
    };
    await tx
      .update(proxyGroups)
      .set({ name: values.name, type: values.type, options: values.options, members, yaml })
      .where(eq(proxyGroups.id, row.id));
    await syncPointerReferences(tx, "group", row.id, yaml);
  }
}

async function updateSubscriptionReferences(tx: Tx, ids: number[], pointer: Pointer, available: YamlPointerDefinition[]) {
  if (!ids.length) return;
  for (const row of await tx.select().from(subscriptions).where(inArray(subscriptions.id, ids))) {
    if (!row.yaml) continue;
    const yaml = materializeYamlPointer(row.yaml, pointer.name, pointer.value);
    const values = parseProviderSubscription(yaml, available);
    await tx.update(subscriptions).set({ ...values, yaml }).where(eq(subscriptions.id, row.id));
    await syncPointerReferences(tx, "subscription", row.id, yaml);
  }
}

async function updateRuleProviderReferences(tx: Tx, ids: number[], pointer: Pointer, available: YamlPointerDefinition[]) {
  if (!ids.length) return;
  for (const row of await tx.select().from(ruleProviders).where(inArray(ruleProviders.id, ids))) {
    if (!row.yaml) continue;
    const yaml = materializeYamlPointer(row.yaml, pointer.name, pointer.value);
    const values = parseRuleProviderConfig(yaml, available);
    await tx.update(ruleProviders).set({ ...values, yaml }).where(eq(ruleProviders.id, row.id));
    await syncPointerReferences(tx, "ruleProvider", row.id, yaml);
  }
}

export async function deletePointer(id: number) {
  return run(async (db) => {
    await db.transaction(async (tx) => {
      const [pointer] = await tx.select().from(pointers).where(eq(pointers.id, id));
      if (!pointer) return;
      const refs = await tx.select().from(pointerReferences).where(eq(pointerReferences.pointerId, id));
      const available = (await loadYamlPointers(tx)).filter((item) => item.name !== pointer.name);

      await updateProfileReferences(tx, referenceIds(refs, "profile"), pointer, available);
      await updateNodeReferences(tx, referenceIds(refs, "node"), pointer, available);
      await updateListenerReferences(tx, referenceIds(refs, "listener"), pointer, available);
      await updateGroupReferences(tx, referenceIds(refs, "group"), pointer, available);
      await updateSubscriptionReferences(tx, referenceIds(refs, "subscription"), pointer, available);
      await updateRuleProviderReferences(tx, referenceIds(refs, "ruleProvider"), pointer, available);
      await tx.delete(pointers).where(eq(pointers.id, id));
    });
    revalidatePath("/", "layout");
  });
}
