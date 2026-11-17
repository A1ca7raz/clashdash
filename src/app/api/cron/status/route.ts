import { getDb } from "@/db";
import { requireAuth } from "@/server/auth";
import { isOverrideLocked } from "@/server/override-lock";
import { getSubscriptionCronSnapshot } from "@/server/subscription-cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (await isOverrideLocked()) {
    return Response.json({ error: "service locked: remove ADMIN_OVERRIDE_PASSWORD and redeploy" }, { status: 503 });
  }
  try {
    await requireAuth();
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json(await getSubscriptionCronSnapshot(await getDb()), {
    headers: { "Cache-Control": "no-store" },
  });
}
