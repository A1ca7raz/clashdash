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
  if (!token || token.length > 2048) return "请完成人机验证";
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim();
  let data: { success?: boolean; action?: string; hostname?: string };
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`siteverify ${res.status}`);
    data = await res.json();
  } catch {
    return "人机验证服务暂时不可用，请稍后重试";
  }
  if (!data.success) return "人机验证未通过，请重试";
  if (data.action && data.action !== "login") return "人机验证未通过，请重试";
  const hostnames = (process.env.TURNSTILE_HOSTNAMES ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  if (hostnames.length && (!data.hostname || !hostnames.includes(data.hostname))) {
    return "人机验证未通过，请重试";
  }
  return null;
}
