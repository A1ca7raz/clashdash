import { getDb } from "@/db";
import { refreshMany } from "@/server/fetcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const results = await refreshMany(db, "all", { force: true });
  return Response.json({ refreshed: results.length, failed: results.filter((r) => !r.ok) });
}
