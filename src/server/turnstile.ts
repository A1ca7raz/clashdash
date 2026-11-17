import "server-only";
import { headers } from "next/headers";

/** Site key is exposed to the client only when both keys are configured. */
export function turnstileSiteKey(): string | null {
  const site = process.env.TURNSTILE_SITE_KEY;
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!site || !secret) {
    if (site || secret) console.warn("TURNSTILE_SITE_KEY 与 TURNSTILE_SECRET_KEY 必须同时配置，Turnstile 验证未启用。");
    return null;
  }
  return site;
}

/** Returns null on success or when Turnstile is not configured; otherwise an error message. */
export async function verifyTurnstile(token: string): Promise<string | null> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return null;
  if (!token) return "请完成人机验证";
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim();
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success ? null : "人机验证未通过，请重试";
  } catch {
    return "人机验证服务暂时不可用，请稍后重试";
  }
}
