"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { verifyAdminPassword, verifyTotpLogin } from "@/server/admin-auth";
import { clearAuthCookies, setSessionCookie, setTotpChallengeCookie } from "@/server/auth";
import { TOTP_CHALLENGE_COOKIE, verifyTotpChallenge } from "@/lib/session";

export interface LoginState {
  error?: string;
  requiresTotp?: boolean;
}

export async function login(_prev: LoginState | undefined, formData: FormData): Promise<LoginState> {
  const store = await cookies();
  const challenge = await verifyTotpChallenge(store.get(TOTP_CHALLENGE_COOKIE)?.value);
  const token = String(formData.get("token") ?? "");
  if (challenge) {
    try {
      const authVersion = await verifyTotpLogin(await getDb(), token, challenge.authVersion);
      await setSessionCookie(authVersion);
    } catch (err) {
      return { error: (err as Error).message, requiresTotp: true };
    }
    redirect("/");
  }
  if (token) return { error: "登录验证已过期，请重新输入密码" };

  let auth;
  try {
    auth = await verifyAdminPassword(await getDb(), String(formData.get("password") ?? ""));
  } catch (err) {
    return { error: (err as Error).message };
  }
  if (!auth) return { error: "密码错误" };
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

export async function logout() {
  await clearAuthCookies();
  redirect("/login");
}
