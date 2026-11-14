import { getDb } from "@/db";
import { applyAdminPasswordOverride } from "@/server/admin-auth";

export async function register() {
  if (await applyAdminPasswordOverride(await getDb())) {
    console.warn("ADMIN_OVERRIDE_PASSWORD is active; remove it and restart after signing in.");
  }
}
