"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Db } from "@/db";
import { getDb } from "@/db";
import { isDatabaseInitializationRequired, DatabaseInitializationRequired } from "@/db/errors";
import type { AdminAuth } from "@/db/schema";
import { ensureAdminAuth, verifyAdminPassword, verifyTotpLogin } from "@/server/admin-auth";
import { clearAuthCookies, setSessionCookie, setTotpChallengeCookie } from "@/server/auth";
import { initializeEmptyDatabase } from "@/server/database-init";
import { TOTP_CHALLENGE_COOKIE, verifyTotpChallenge } from "@/lib/session";

export interface LoginState {
  error?: string;
  requiresTotp?: boolean;
}

async function finishLogin(auth: AdminAuth): Promise<LoginState> {
  if (auth.totpSecret) {
    try {
      await setTotpChallengeCookie(auth.authVersion);
    } catch (err) {
      return { error: (err as Error).message };
    }
    return { requiresTotp: true };
  }
  try {
    await setSessionCookie(auth.authVersion);
  } catch (err) {
    return { error: (err as Error).message };
  }
  redirect("/");
}

async function initialize(db: Db, reason: "schema" | "admin", password: string): Promise<LoginState> {
  const initialPassword = process.env.ADMIN_INITIAL_PASSWORD;
  if (!initialPassword) return { error: "数据库尚未初始化，请先设置 ADMIN_INITIAL_PASSWORD" };
  if (password !== initialPassword) return { error: "初始密码错误" };
  let auth: AdminAuth;
  try {
    if (reason === "schema") await initializeEmptyDatabase(db);
    auth = await ensureAdminAuth(db);
  } catch (err) {
    return { error: (err as Error).message };
  }
  return finishLogin(auth);
}

export async function login(_prev: LoginState | undefined, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const requestedInit = String(formData.get("initialization") ?? "");
  if (requestedInit === "schema" || requestedInit === "admin") {
    return initialize(await getDb(), requestedInit, password);
  }

  const store = await cookies();
  const challenge = await verifyTotpChallenge(store.get(TOTP_CHALLENGE_COOKIE)?.value);
  const token = String(formData.get("token") ?? "");
  if (challenge && !formData.has("password")) {
    try {
      const authVersion = await verifyTotpLogin(await getDb(), token, challenge.authVersion);
      await setSessionCookie(authVersion);
    } catch (err) {
      if (isDatabaseInitializationRequired(err)) {
        await clearAuthCookies();
        return { error: "数据库需要初始化，请重新输入初始密码" };
      }
      return { error: (err as Error).message, requiresTotp: true };
    }
    redirect("/");
  }
  if (token) return { error: "登录验证已过期，请重新输入密码" };

  let auth: AdminAuth | null;
  try {
    auth = await verifyAdminPassword(await getDb(), password);
  } catch (err) {
    if (err instanceof DatabaseInitializationRequired) return initialize(await getDb(), err.reason, password);
    if (isDatabaseInitializationRequired(err)) return initialize(await getDb(), "schema", password);
    return { error: (err as Error).message };
  }
  if (!auth) return { error: "密码错误" };
  return finishLogin(auth);
}

export async function logout() {
  await clearAuthCookies();
  redirect("/login");
}
