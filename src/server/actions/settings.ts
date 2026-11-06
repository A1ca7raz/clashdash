"use server";

import { revalidatePath } from "next/cache";
import { importAll } from "@/server/backup";
import { run } from "./common";

export async function importBackup(json: string) {
  return run(async (db) => {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      throw new Error("不是有效的 JSON 文件");
    }
    await importAll(db, raw);
    revalidatePath("/", "layout");
  });
}
