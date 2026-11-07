"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { listeners, profiles } from "@/db/schema";
import { parseListenerConfig } from "@/lib/listener-config";
import { run } from "./common";

const done = () => revalidatePath("/", "layout");

export async function saveListener(yamlText: string, id?: number) {
  return run(async (db) => {
    const values = parseListenerConfig(yamlText);
    if (id) {
      await db.update(listeners).set(values).where(eq(listeners.id, id));
    } else {
      await db.insert(listeners).values({ ...values, sort: await db.$count(listeners) });
    }
    done();
  });
}

export async function setListenerEnabled(id: number, enabled: boolean) {
  return run(async (db) => {
    await db.update(listeners).set({ enabled }).where(eq(listeners.id, id));
    done();
  });
}

export async function deleteListener(id: number) {
  return run(async (db) => {
    await db.transaction(async (tx) => {
      await tx.delete(listeners).where(eq(listeners.id, id));
      for (const p of await tx.select().from(profiles)) {
        if (p.listenerIds.includes(id)) {
          await tx.update(profiles).set({ listenerIds: p.listenerIds.filter((x) => x !== id) }).where(eq(profiles.id, p.id));
        }
      }
    });
    done();
  });
}
