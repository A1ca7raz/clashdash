import { LogOutIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { logout } from "@/server/actions/auth";
import { requireAuth } from "@/server/auth";
import { Nav } from "./nav";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireAuth();
  } catch {
    redirect("/login");
  }
  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 flex h-svh w-52 shrink-0 flex-col border-r bg-muted/30 p-3">
        <div className="px-2 pt-1 pb-4">
          <div className="font-semibold">ClashDash</div>
          <div className="text-xs text-muted-foreground">mihomo 配置管理</div>
        </div>
        <Nav />
        <div className="mt-auto flex items-center gap-1">
          <form action={logout} className="flex-1">
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" type="submit">
              <LogOutIcon />
              退出登录
            </Button>
          </form>
          <ThemeToggle />
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}
