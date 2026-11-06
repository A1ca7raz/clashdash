"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { parse as parseYaml } from "yaml";
import { nodes, profiles } from "@/db/schema";
import { parseSubscription } from "@/lib/parser";
import type { MihomoProxy } from "@/lib/types";
import { run } from "./common";

const manual = (id: number) => and(eq(nodes.id, id), isNull(nodes.subscriptionId));

export async function importManualNodes(text: string) {
  return run(async (db) => {
    const parsed = parseSubscription(text);
    if (parsed.nodes.length === 0) throw new Error(parsed.errors[0] ?? "没有解析到节点");
    const count = await db.$count(nodes, isNull(nodes.subscriptionId));
    await db.insert(nodes).values(
      parsed.nodes.map((n, i) => ({ subscriptionId: null, name: n.name, type: n.type, config: n, sort: count + i })),
    );
    revalidatePath("/", "layout");
    return { added: parsed.nodes.length, errors: parsed.errors };
  });
}

export async function updateManualNode(id: number, yamlText: string) {
  return run(async (db) => {
    const config = parseYaml(yamlText) as MihomoProxy | null;
    if (!config || typeof config !== "object" || typeof config.name !== "string" || typeof config.type !== "string") {
      throw new Error("节点必须是包含 name 和 type 的 YAML 映射");
    }
    await db.update(nodes).set({ name: config.name, type: config.type, config }).where(manual(id));
    revalidatePath("/", "layout");
  });
}

export async function setManualNodeEnabled(id: number, enabled: boolean) {
  return run(async (db) => {
    await db.update(nodes).set({ enabled }).where(manual(id));
    revalidatePath("/", "layout");
  });
}

export async function deleteManualNode(id: number) {
  return run(async (db) => {
    await db.transaction(async (tx) => {
      await tx.delete(nodes).where(manual(id));
      for (const p of await tx.select().from(profiles)) {
        if (p.manualNodeIds.includes(id)) {
          await tx.update(profiles).set({ manualNodeIds: p.manualNodeIds.filter((x) => x !== id) }).where(eq(profiles.id, p.id));
        }
      }
    });
    revalidatePath("/", "layout");
  });
}
