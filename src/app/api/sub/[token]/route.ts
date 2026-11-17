import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { isDatabaseInitializationRequired } from "@/db/errors";
import { profiles } from "@/db/schema";
import { aggregateUserInfo, generateForProfile } from "@/server/profile-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const db = await getDb();
    const [profile] = await db
      .update(profiles)
      .set({ lastPulledAt: new Date() })
      .where(eq(profiles.token, token))
      .returning();
    if (!profile) return new Response("Not Found", { status: 404 });

    const { input, result } = await generateForProfile(db, profile);

    if (result.errors.length) {
      // A non-2xx status makes clients keep their previous config instead of loading a broken one.
      const body = ["# 配置生成失败，请在管理界面修正以下问题：", ...result.errors.map((e) => `# - ${e}`), ""].join("\n");
      return new Response(body, { status: 422, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }

    const headers = new Headers({
      "Content-Type": "text/yaml; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(profile.name)}.yaml`,
      "Profile-Update-Interval": String(profile.updateInterval),
      "Cache-Control": "no-store",
    });
    const info = aggregateUserInfo(input);
    if (info) {
      headers.set(
        "Subscription-Userinfo",
        `upload=${info.upload}; download=${info.download}; total=${info.total}${info.expire ? `; expire=${info.expire}` : ""}`,
      );
    }
    return new Response(result.yaml, { headers });
  } catch (err) {
    if (isDatabaseInitializationRequired(err)) return new Response("Database initialization required", { status: 503 });
    throw err;
  }
}
