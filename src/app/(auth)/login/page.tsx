import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <LoginForm overrideEnabled={Boolean(process.env.ADMIN_OVERRIDE_PASSWORD)} />
    </main>
  );
}
