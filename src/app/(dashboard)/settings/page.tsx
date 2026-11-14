import { getDb } from "@/db";
import { PageHeader } from "@/components/page-header";
import { ensureAdminAuth } from "@/server/admin-auth";
import { getSubscriptionCronSnapshot } from "@/server/subscription-cron";
import { BackupSection } from "./backup-card";
import { CronMonitor } from "./cron-monitor";
import { SecuritySection } from "./security-card";

export default async function SettingsPage() {
  const url = process.env.DATABASE_URL;
  const database = !url ? "PGlite（本地 .data/pglite）" : new URL(url).hostname.endsWith(".neon.tech") ? "Neon" : "Postgres";
  const db = await getDb();
  const auth = await ensureAdminAuth(db);
  return (
    <>
      <PageHeader title="设置" />
      <div className="grid gap-6">
        <SecuritySection totpEnabled={!!auth.totpSecret} />
        <BackupSection />
        <CronMonitor initialStatus={await getSubscriptionCronSnapshot(db)} unavailable={!!process.env.VERCEL} />
        <section className="grid gap-4 border-t pt-5">
          <div className="grid gap-1">
            <h2 className="text-sm font-medium">运行环境</h2>
            <p className="text-sm text-muted-foreground">以下项目通过环境变量配置。</p>
          </div>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">数据库</dt>
            <dd>{database}</dd>
            <dt className="text-muted-foreground">外部 Cron</dt>
            <dd>{process.env.CRON_SECRET ? "已设置 CRON_SECRET" : "未设置 CRON_SECRET，/api/cron/refresh 不可用"}</dd>
          </dl>
        </section>
      </div>
    </>
  );
}
