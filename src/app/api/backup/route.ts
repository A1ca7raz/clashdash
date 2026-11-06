import { getDb } from "@/db";
import { exportAll } from "@/server/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Protected by middleware (requires a session). */
export async function GET() {
  const db = await getDb();
  const backup = await exportAll(db);
  const date = backup.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="clashdash-backup-${date}.json"`,
    },
  });
}
