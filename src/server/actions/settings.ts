"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { adminAuth } from "@/db/schema";
import { changeAdminPassword, confirmTotpEnrollment, disableAdminTotp, startTotpEnrollment } from "@/server/admin-auth";
import { setSessionCookie } from "@/server/auth";
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

export async function changePassword(currentPassword: string, newPassword: string, token: string) {
  const result = await run((db) => changeAdminPassword(db, currentPassword, newPassword, token));
  if (result.ok) await setSessionCookie(result.data);
  return result;
}

export async function beginTotpEnrollment(password: string) {
  return run((db) => startTotpEnrollment(db, password));
}

export async function enableTotp(token: string) {
  const result = await run((db) => confirmTotpEnrollment(db, token));
  if (result.ok) await setSessionCookie(result.data);
  return result;
}

export async function cancelTotpEnrollment() {
  return run(async (db) => {
    await db.update(adminAuth).set({ totpPendingSecret: null }).where(eq(adminAuth.id, 1));
  });
}

export async function disableTotp(password: string, token: string) {
  const result = await run((db) => disableAdminTotp(db, password, token));
  if (result.ok) await setSessionCookie(result.data);
  return result;
}
