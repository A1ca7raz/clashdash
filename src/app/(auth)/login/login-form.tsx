"use client";

import { useActionState, useEffect, useState } from "react";
import Script from "next/script";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/server/actions/auth";

declare global {
  interface Window {
    turnstile?: { reset: () => void };
    __turnstileCallback?: (token: string) => void;
    __turnstileClear?: () => void;
  }
}

export function LoginForm({
  initialization,
  initialPasswordConfigured,
  databaseError,
  turnstileSiteKey,
}: {
  initialization: "schema" | "admin" | null;
  initialPasswordConfigured: boolean;
  databaseError?: string;
  turnstileSiteKey?: string | null;
}) {
  const [state, action, pending] = useActionState(login, undefined);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const unavailable = !!databaseError || (!!initialization && !initialPasswordConfigured);
  const showTurnstile = !!turnstileSiteKey && !state?.requiresTotp;

  // Implicit Turnstile rendering reports results through these global callbacks.
  useEffect(() => {
    window.__turnstileCallback = (token) => setTurnstileToken(token);
    window.__turnstileClear = () => setTurnstileToken(null);
    return () => {
      delete window.__turnstileCallback;
      delete window.__turnstileClear;
    };
  }, []);

  // A consumed Turnstile token cannot be reused; reset the widget after a failed submit.
  useEffect(() => {
    if (state?.error && showTurnstile) {
      window.turnstile?.reset();
      setTurnstileToken(null);
    }
  }, [state?.error, showTurnstile]);

  return (
    <Card className="w-full max-w-sm">
      {showTurnstile && (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
      )}
      <CardHeader>
        <CardTitle className="text-lg">ClashDash</CardTitle>
        <CardDescription>
          {state?.requiresTotp ? "输入认证器中的六位验证码" : initialization ? "首次部署数据库初始化" : "mihomo 配置管理平台"}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {databaseError && (
          <Alert variant="destructive">
            <AlertTitle>数据库不可用</AlertTitle>
            <AlertDescription>{databaseError}</AlertDescription>
          </Alert>
        )}
        {initialization && !initialPasswordConfigured && (
          <Alert variant="destructive">
            <AlertTitle>无法初始化数据库</AlertTitle>
            <AlertDescription>请先设置 ADMIN_INITIAL_PASSWORD，再刷新本页面。</AlertDescription>
          </Alert>
        )}
        {initialization && initialPasswordConfigured && (
          <Alert>
            <AlertTitle>需要初始化</AlertTitle>
            <AlertDescription>输入 ADMIN_INITIAL_PASSWORD。验证通过后才会检查并初始化数据库，部分缺表不会被自动修复。</AlertDescription>
          </Alert>
        )}
        <form action={action} className="grid gap-4">
          {initialization && <input type="hidden" name="initialization" value={initialization} />}
          {state?.requiresTotp ? (
            <div className="grid gap-2">
              <Label htmlFor="token">两步验证码</Label>
              <Input
                id="token"
                name="token"
                inputMode="numeric"
                autoFocus
                required
                autoComplete="one-time-code"
                maxLength={6}
                pattern="[0-9]{6}"
              />
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="password">{initialization ? "初始管理密码" : "管理密码"}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoFocus
                required
                disabled={unavailable}
                autoComplete="current-password"
              />
            </div>
          )}
          {showTurnstile && (
            <div
              className="cf-turnstile"
              data-sitekey={turnstileSiteKey}
              data-action="login"
              data-callback="__turnstileCallback"
              data-expired-callback="__turnstileClear"
              data-error-callback="__turnstileClear"
            />
          )}
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending || unavailable || (showTurnstile && !turnstileToken)}>
            {pending ? (initialization ? "初始化中…" : "登录中…") : state?.requiresTotp ? "验证并登录" : initialization ? "初始化并登录" : "登录"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
