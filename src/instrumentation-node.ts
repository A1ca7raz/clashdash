import { getDb } from "@/db";
import { isDatabaseInitializationRequired } from "@/db/errors";
import { applyAdminPasswordOverride } from "@/server/admin-auth";
import { startSubscriptionCron } from "@/server/subscription-cron";

export async function register() {
  const cronEnabled = !process.env.VERCEL;
  if (!process.env.ADMIN_OVERRIDE_PASSWORD && !cronEnabled) return;
  const db = await getDb();
  try {
    if (await applyAdminPasswordOverride(db)) {
      console.warn("ADMIN_OVERRIDE_PASSWORD is active; remove it and restart after signing in.");
    }
  } catch (err) {
    if (!isDatabaseInitializationRequired(err)) throw err;
    console.warn("Database initialization is required before admin password recovery can run.");
  }
  if (cronEnabled) startSubscriptionCron(db);
}
