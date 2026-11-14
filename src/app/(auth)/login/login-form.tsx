"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/server/actions/auth";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-lg">ClashDash</CardTitle>
        <CardDescription>{state?.requiresTotp ? "输入认证器中的六位验证码" : "mihomo 配置管理平台"}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
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
              <Label htmlFor="password">管理密码</Label>
              <Input id="password" name="password" type="password" autoFocus required autoComplete="current-password" />
            </div>
          )}
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "登录中…" : state?.requiresTotp ? "验证并登录" : "登录"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
