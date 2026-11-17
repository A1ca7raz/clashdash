import { getDb } from "@/db";
import { requireAuth } from "@/server/auth";
import { exportAll } from "@/server/backup";
import { isOverrideLocked } from "@/server/override-lock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (await isOverrideLocked()) {
    return Response.json({ error: "service locked: remove ADMIN_OVERRIDE_PASSWORD and redeploy" }, { status: 503 });
  }
  try {
    await requireAuth();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const db = await getDb();
  const backup = await exportAll(db);
  const date = backup.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="clashdash-backup-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
