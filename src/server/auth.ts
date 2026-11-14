import "server-only";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import type { AdminAuth } from "@/db/schema";
import {
  createSessionToken,
  createTotpChallenge,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  TOTP_CHALLENGE_COOKIE,
  TOTP_CHALLENGE_MAX_AGE,
  verifySessionToken,
} from "@/lib/session";
import { ensureAdminAuth } from "@/server/admin-auth";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
} as const;

/** Server actions are reachable by POST regardless of the page; every action checks the session itself. */
export async function requireAuth(): Promise<AdminAuth> {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) throw new Error("未登录或会话已过期");
  const row = await ensureAdminAuth(await getDb());
  if (row.authVersion !== session.authVersion) throw new Error("登录状态已失效，请重新登录");
  return row;
}

export async function setSessionCookie(authVersion: number) {
  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(authVersion), { ...cookieOptions, maxAge: SESSION_MAX_AGE });
  store.delete(TOTP_CHALLENGE_COOKIE);
}

export async function setTotpChallengeCookie(authVersion: number) {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.set(TOTP_CHALLENGE_COOKIE, await createTotpChallenge(authVersion), {
    ...cookieOptions,
    maxAge: TOTP_CHALLENGE_MAX_AGE,
  });
}

export async function clearAuthCookies() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(TOTP_CHALLENGE_COOKIE);
}
