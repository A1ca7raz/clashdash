"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { listeners, profiles } from "@/db/schema";
import { LISTENER_TYPES } from "@/lib/types";
import { run } from "./common";

const done = () => revalidatePath("/", "layout");

const listenerSchema = z
  .object({
    id: z.number().int().optional(),
    name: z.string().trim().min(1, "名称不能为空"),
    type: z.enum(LISTENER_TYPES),
    listen: z.string().trim().default("0.0.0.0"),
    port: z.number().int().min(1).max(65535).nullable(),
    proxy: z.string().trim().min(1).nullable(),
    subRule: z.string().trim().min(1).nullable(),
    options: z.record(z.string(), z.unknown()),
    enabled: z.boolean(),
  })
  .refine((v) => !(v.proxy && v.subRule), { message: "代理和子规则只能选一个", path: ["proxy"] })
  .refine((v) => v.type === "tun" || v.port !== null, { message: "端口不能为空", path: ["port"] });

export type ListenerInput = z.input<typeof listenerSchema>;

export async function saveListener(input: ListenerInput) {
  return run(async (db) => {
    const v = listenerSchema.parse(input);
    if (v.id) {
      await db.update(listeners).set(v).where(eq(listeners.id, v.id));
    } else {
      await db.insert(listeners).values({ ...v, sort: await db.$count(listeners) });
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
