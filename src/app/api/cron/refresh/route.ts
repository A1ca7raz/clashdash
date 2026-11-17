import { getDb } from "@/db";
import { isDatabaseInitializationRequired } from "@/db/errors";
import { refreshMany } from "@/server/fetcher";
import { isOverrideLocked } from "@/server/override-lock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (await isOverrideLocked()) {
    return Response.json({ error: "service locked: remove ADMIN_OVERRIDE_PASSWORD and redeploy" }, { status: 503 });
  }
  try {
    const db = await getDb();
    const results = await refreshMany(db, "all", { force: true });
    return Response.json({ refreshed: results.length, failed: results.filter((r) => !r.ok) });
  } catch (err) {
    if (isDatabaseInitializationRequired(err)) return Response.json({ error: "database initialization required" }, { status: 503 });
    throw err;
  }
}
