import "server-only";
import { getDb } from "@/db";
import { isDatabaseInitializationRequired } from "@/db/errors";
import { applyAdminPasswordOverride } from "@/server/admin-auth";

let cachedLocked = false;

/**
 * While ADMIN_OVERRIDE_PASSWORD is set the whole service is locked. The first call per instance
 * applies the one-time reset (idempotent via its marker), so on serverless platforms any request
 * reaching the Node runtime triggers it even if instrumentation did not run.
 */
export async function isOverrideLocked(): Promise<boolean> {
  if (!process.env.ADMIN_OVERRIDE_PASSWORD) {
    cachedLocked = false;
    return false;
  }
  if (cachedLocked) return true;
  try {
    await applyAdminPasswordOverride(await getDb());
  } catch (err) {
    // An uninitialized database cannot be reset yet, but the lock still applies.
    if (!isDatabaseInitializationRequired(err)) console.error("管理员密码重置失败：", err);
  }
  cachedLocked = true;
  return true;
}
