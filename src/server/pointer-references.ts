import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import {
  listeners,
  nodes,
  pointerReferences,
  pointers,
  profiles,
  proxyGroups,
  ruleProviders,
  subscriptions,
  type PointerResourceType,
} from "@/db/schema";
import { yamlPointerReferences, type YamlPointerDefinition } from "@/lib/yaml-pointer";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Database = Db | Tx;

export async function loadYamlPointers(db: Database): Promise<YamlPointerDefinition[]> {
  return db.select({ name: pointers.name, value: pointers.value }).from(pointers);
}

export async function syncPointerReferences(
  db: Database,
  resourceType: PointerResourceType,
  resourceId: number,
  yaml: string | null,
): Promise<void> {
  await db
    .delete(pointerReferences)
    .where(and(eq(pointerReferences.resourceType, resourceType), eq(pointerReferences.resourceId, resourceId)));
  if (yaml === null) return;
  const names = yamlPointerReferences(yaml);
  if (!names.length) return;
  const known = await db.select({ id: pointers.id, name: pointers.name }).from(pointers).where(inArray(pointers.name, names));
  if (!known.length) return;
  await db.insert(pointerReferences).values(
    known.map((pointer) => ({ pointerId: pointer.id, resourceType, resourceId })),
  );
}

export async function clearPointerReferences(
  db: Database,
  resourceType: PointerResourceType,
  resourceIds: number[],
): Promise<void> {
  if (!resourceIds.length) return;
  await db
    .delete(pointerReferences)
    .where(and(eq(pointerReferences.resourceType, resourceType), inArray(pointerReferences.resourceId, resourceIds)));
}

export async function rebuildAllPointerReferences(db: Database): Promise<void> {
  await db.delete(pointerReferences);

  for (const row of await db.select({ id: profiles.id, yaml: profiles.baseConfig }).from(profiles)) {
    await syncPointerReferences(db, "profile", row.id, row.yaml);
  }
  for (const row of await db.select({ id: nodes.id, yaml: nodes.yaml }).from(nodes)) {
    await syncPointerReferences(db, "node", row.id, row.yaml);
  }
  for (const row of await db.select({ id: listeners.id, yaml: listeners.yaml }).from(listeners)) {
    await syncPointerReferences(db, "listener", row.id, row.yaml);
  }
  for (const row of await db.select({ id: proxyGroups.id, yaml: proxyGroups.yaml }).from(proxyGroups)) {
    await syncPointerReferences(db, "group", row.id, row.yaml);
  }
  for (const row of await db.select({ id: subscriptions.id, yaml: subscriptions.yaml }).from(subscriptions)) {
    await syncPointerReferences(db, "subscription", row.id, row.yaml);
  }
  for (const row of await db.select({ id: ruleProviders.id, yaml: ruleProviders.yaml }).from(ruleProviders)) {
    await syncPointerReferences(db, "ruleProvider", row.id, row.yaml);
  }
}
