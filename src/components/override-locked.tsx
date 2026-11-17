export function OverrideLockedNotice() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-lg font-semibold">服务处于密码重置锁定状态</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          检测到 ADMIN_OVERRIDE_PASSWORD：管理密码已在本次启动时重置，两步验证已清除。为防止该变量被长期遗留，服务在移除它之前保持不可用。
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          请移除 ADMIN_OVERRIDE_PASSWORD 并重新部署/重启服务，然后使用新密码登录。首次部署请先不要设置该变量，待数据库初始化完成后再按需使用。
        </p>
      </div>
    </main>
  );
}
