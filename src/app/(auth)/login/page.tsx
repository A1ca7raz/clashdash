import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { isDatabaseInitializationRequired } from "@/db/errors";
import { findAdminAuth } from "@/server/admin-auth";
import { requireAuth } from "@/server/auth";
import { turnstileSiteKey } from "@/server/turnstile";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  // A valid, current session goes straight to the dashboard instead of the login form.
  let authenticated = false;
  try {
    await requireAuth();
    authenticated = true;
  } catch {
    // Not signed in, stale session, or uninitialized database: fall through to the form.
  }
  if (authenticated) redirect("/");

  const { reason } = await searchParams;
  let initialization: "schema" | "admin" | null = reason === "database" ? "schema" : null;
  let databaseError: string | undefined;
  try {
    if (!initialization && !(await findAdminAuth(await getDb()))) initialization = "admin";
  } catch (err) {
    if (isDatabaseInitializationRequired(err)) initialization = "schema";
    else databaseError = "数据库状态检查失败，请检查数据库连接和服务日志。";
  }
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <LoginForm
        initialization={initialization}
        initialPasswordConfigured={Boolean(process.env.ADMIN_INITIAL_PASSWORD)}
        databaseError={databaseError}
        turnstileSiteKey={turnstileSiteKey()}
      />
    </main>
  );
}
