import "server-only";
import { ZodError } from "zod";
import { getDb, type Db } from "@/db";
import { isDatabaseInitializationRequired } from "@/db/errors";
import { requireAuth } from "@/server/auth";
import { isOverrideLocked } from "@/server/override-lock";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function friendly(err: unknown): string {
  if (isDatabaseInitializationRequired(err)) return "数据库需要初始化，请前往登录页完成初始化";
  if (err instanceof ZodError) return err.issues.map((i) => `${i.path.join(".") || "输入"}：${i.message}`).join("；");
  const e = err as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = e.code ?? e.cause?.code;
  if (code === "23505") return "名称已存在";
  if (code === "23503") return "引用的数据不存在";
  return e.cause?.message ?? e.message ?? String(err);
}

/** Wraps an action body with the session check, a DB handle and uniform error reporting. */
export async function run<T>(fn: (db: Db) => Promise<T>): Promise<ActionResult<T>> {
  try {
    if (await isOverrideLocked()) {
      throw new Error("服务处于密码重置锁定状态，请移除 ADMIN_OVERRIDE_PASSWORD 并重新部署/重启");
    }
    await requireAuth();
    const db = await getDb();
    return { ok: true, data: await fn(db) };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

export class UserError extends Error {}
