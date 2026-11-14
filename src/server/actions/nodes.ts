"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Db } from "@/db";
import { nodes } from "@/db/schema";
import { parseManualNodeConfig } from "@/lib/node-config";
import { parseSubscription } from "@/lib/parser";
import { clearPointerReferences, loadYamlPointers, syncPointerReferences } from "@/server/pointer-references";
import { updateManualNodeConfig } from "@/server/profile-data";
import { run } from "./common";

const manual = (id: number) => and(eq(nodes.id, id), isNull(nodes.subscriptionId));
const batchIdsSchema = z.array(z.number().int()).min(1).transform((ids) => [...new Set(ids)]);

export async function createManualNode(yamlText: string) {
  return run(async (db) => {
    const pointers = await loadYamlPointers(db);
    const config = parseManualNodeConfig(yamlText, pointers);
    await db.transaction(async (tx) => {
      const count = await tx.$count(nodes, isNull(nodes.subscriptionId));
      const [created] = await tx
        .insert(nodes)
        .values({ subscriptionId: null, name: config.name, type: config.type, config, yaml: yamlText, sort: count })
        .returning({ id: nodes.id });
      await syncPointerReferences(tx, "node", created.id, yamlText);
    });
    revalidatePath("/", "layout");
  });
}

export async function importManualNodes(text: string) {
  return run(async (db) => {
    const parsed = parseSubscription(text);
    if (parsed.nodes.length === 0) throw new Error(parsed.errors[0] ?? "没有解析到节点");
    const count = await db.$count(nodes, isNull(nodes.subscriptionId));
    await db.insert(nodes).values(
      parsed.nodes.map((n, i) => ({
        subscriptionId: null,
        name: n.name,
        type: n.type,
        config: n,
        yaml: null,
        sort: count + i,
      })),
    );
    revalidatePath("/", "layout");
    return { added: parsed.nodes.length, errors: parsed.errors };
  });
}

export async function updateManualNode(id: number, yamlText: string) {
  return run(async (db) => {
    const pointers = await loadYamlPointers(db);
    const config = parseManualNodeConfig(yamlText, pointers);
    await updateManualNodeConfig(db, id, config, yamlText);
    revalidatePath("/", "layout");
  });
}

export async function setManualNodeEnabled(id: number, enabled: boolean) {
  return run(async (db) => {
    await db.update(nodes).set({ enabled }).where(manual(id));
    revalidatePath("/", "layout");
  });
}

async function removeManualNodes(db: Db, ids: number[]) {
  return db.transaction(async (tx) => {
    const deleted = await tx
      .delete(nodes)
      .where(and(inArray(nodes.id, ids), isNull(nodes.subscriptionId)))
      .returning({ id: nodes.id });
    if (deleted.length) await clearPointerReferences(tx, "node", deleted.map((row) => row.id));
    return deleted.length;
  });
}

export async function deleteManualNodes(ids: number[]) {
  return run(async (db) => {
    const count = await removeManualNodes(db, batchIdsSchema.parse(ids));
    revalidatePath("/", "layout");
    return count;
  });
}

export async function deleteManualNode(id: number) {
  return run(async (db) => {
    await removeManualNodes(db, [id]);
    revalidatePath("/", "layout");
  });
}
