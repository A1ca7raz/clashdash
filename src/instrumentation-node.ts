import { getDb } from "@/db";
import { isDatabaseInitializationRequired } from "@/db/errors";
import { applyAdminPasswordOverride } from "@/server/admin-auth";
import { startSubscriptionCron } from "@/server/subscription-cron";

export async function register() {
  const cronEnabled = !process.env.VERCEL;
  const db = await getDb();
  try {
    // Also clears the one-shot override marker once the variable has been removed.
    if (await applyAdminPasswordOverride(db)) {
      console.warn(
        "ADMIN_OVERRIDE_PASSWORD is active: the admin password was reset and the service stays locked until the variable is removed and the service restarts.",
      );
    }
  } catch (err) {
    // A database hiccup here must not crash startup or the build; requests will surface it anyway.
    if (isDatabaseInitializationRequired(err)) {
      console.warn("Database initialization is required before admin password recovery can run.");
    } else {
      console.error("Admin password recovery check failed:", err);
    }
  }
  if (cronEnabled) startSubscriptionCron(db);
}
