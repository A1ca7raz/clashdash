"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Db } from "@/db";
import { listeners } from "@/db/schema";
import { parseListenerConfig } from "@/lib/listener-config";
import { clearPointerReferences, loadYamlPointers, syncPointerReferences } from "@/server/pointer-references";
import { run } from "./common";

const done = () => revalidatePath("/", "layout");
const batchIdsSchema = z.array(z.number().int()).min(1).transform((ids) => [...new Set(ids)]);

export async function saveListener(yamlText: string, id?: number) {
  return run(async (db) => {
    const pointers = await loadYamlPointers(db);
    const values = parseListenerConfig(yamlText, pointers);
    await db.transaction(async (tx) => {
      const [saved] = id
        ? await tx
            .update(listeners)
            .set({ ...values, yaml: yamlText })
            .where(eq(listeners.id, id))
            .returning({ id: listeners.id })
        : await tx
            .insert(listeners)
            .values({ ...values, yaml: yamlText, sort: await tx.$count(listeners) })
            .returning({ id: listeners.id });
      if (saved) await syncPointerReferences(tx, "listener", saved.id, yamlText);
    });
    done();
  });
}

export async function setListenerEnabled(id: number, enabled: boolean) {
  return run(async (db) => {
    await db.update(listeners).set({ enabled }).where(eq(listeners.id, id));
    done();
  });
}

async function removeListeners(db: Db, ids: number[]) {
  return db.transaction(async (tx) => {
    const deleted = await tx.delete(listeners).where(inArray(listeners.id, ids)).returning({ id: listeners.id });
    if (deleted.length) await clearPointerReferences(tx, "listener", deleted.map((row) => row.id));
    return deleted.length;
  });
}

export async function deleteListeners(ids: number[]) {
  return run(async (db) => {
    const count = await removeListeners(db, batchIdsSchema.parse(ids));
    done();
    return count;
  });
}

export async function deleteListener(id: number) {
  return run(async (db) => {
    await removeListeners(db, [id]);
    done();
  });
}
