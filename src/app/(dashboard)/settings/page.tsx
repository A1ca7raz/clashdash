import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BackupCard } from "./backup-card";

export default function SettingsPage() {
  const url = process.env.DATABASE_URL;
  const database = !url ? "PGlite（本地 .data/pglite）" : new URL(url).hostname.endsWith(".neon.tech") ? "Neon" : "Postgres";
  return (
    <>
      <PageHeader title="设置" />
      <div className="grid max-w-3xl gap-4">
        <BackupCard />
        <Card>
          <CardHeader>
            <CardTitle>运行环境</CardTitle>
            <CardDescription>以下项目通过环境变量配置。</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
            <span className="text-muted-foreground">数据库</span>
            <span>{database}</span>
            <span className="text-muted-foreground">定时刷新</span>
            <span>{process.env.CRON_SECRET ? "已设置 CRON_SECRET" : "未设置 CRON_SECRET，/api/cron/refresh 不可用"}</span>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
