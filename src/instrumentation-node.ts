import { getDb } from "@/db";
import { applyAdminPasswordOverride } from "@/server/admin-auth";
import { startSubscriptionCron } from "@/server/subscription-cron";

export async function register() {
  const cronEnabled = !process.env.VERCEL;
  if (!process.env.ADMIN_OVERRIDE_PASSWORD && !cronEnabled) return;
  const db = await getDb();
  if (await applyAdminPasswordOverride(db)) {
    console.warn("ADMIN_OVERRIDE_PASSWORD is active; remove it and restart after signing in.");
  }
  if (cronEnabled) startSubscriptionCron(db);
}
