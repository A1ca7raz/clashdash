"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword } from "@/server/auth";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

export async function login(_prev: { error?: string } | undefined, formData: FormData) {
  if (!process.env.ADMIN_PASSWORD) return { error: "服务器未设置 ADMIN_PASSWORD" };
  if (!checkPassword(String(formData.get("password") ?? ""))) return { error: "密码错误" };

  let token: string;
  try {
    token = await createSessionToken();
  } catch (err) {
    return { error: (err as Error).message };
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  redirect("/");
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
