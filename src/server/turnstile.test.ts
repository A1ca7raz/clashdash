import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", "203.0.113.10"]]),
}));

import { turnstileSiteKey, verifyTurnstile } from "./turnstile";

const envBackup = {
  site: process.env.TURNSTILE_SITE_KEY,
  secret: process.env.TURNSTILE_SECRET_KEY,
  hostnames: process.env.TURNSTILE_HOSTNAMES,
};

beforeEach(() => {
  process.env.TURNSTILE_SITE_KEY = "site-key";
  process.env.TURNSTILE_SECRET_KEY = "secret-key";
  delete process.env.TURNSTILE_HOSTNAMES;
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [key, value] of Object.entries({
    TURNSTILE_SITE_KEY: envBackup.site,
    TURNSTILE_SECRET_KEY: envBackup.secret,
    TURNSTILE_HOSTNAMES: envBackup.hostnames,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function stubSiteverify(payload: unknown, init?: { ok?: boolean; status?: number }) {
  const fetchMock = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
    void args;
    return new Response(JSON.stringify(payload), init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("turnstileSiteKey", () => {
  it("exposes the site key only when both keys are configured", () => {
    expect(turnstileSiteKey()).toBe("site-key");
    delete process.env.TURNSTILE_SECRET_KEY;
    expect(turnstileSiteKey()).toBeNull();
    delete process.env.TURNSTILE_SITE_KEY;
    expect(turnstileSiteKey()).toBeNull();
  });
});

describe("verifyTurnstile", () => {
  it("skips verification when no secret is configured", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const fetchMock = stubSiteverify({});
    await expect(verifyTurnstile("")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects missing and overlong tokens without calling siteverify", async () => {
    const fetchMock = stubSiteverify({ success: true });
    await expect(verifyTurnstile("")).resolves.toBe("请完成人机验证");
    await expect(verifyTurnstile("x".repeat(2049))).resolves.toBe("请完成人机验证");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the secret, token and client ip to siteverify", async () => {
    const fetchMock = stubSiteverify({ success: true, action: "login", hostname: "example.com" });
    await expect(verifyTurnstile("token-1")).resolves.toBeNull();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const body = (init as RequestInit).body as URLSearchParams;
    expect(body.get("secret")).toBe("secret-key");
    expect(body.get("response")).toBe("token-1");
    expect(body.get("remoteip")).toBe("203.0.113.10");
  });

  it("rejects failed verification, wrong action and unexpected hostnames", async () => {
    stubSiteverify({ success: false });
    await expect(verifyTurnstile("token")).resolves.toBe("人机验证未通过，请重试");

    stubSiteverify({ success: true, action: "signup" });
    await expect(verifyTurnstile("token")).resolves.toBe("人机验证未通过，请重试");

    process.env.TURNSTILE_HOSTNAMES = "dash.example.com, www.example.com";
    stubSiteverify({ success: true, action: "login", hostname: "evil.example" });
    await expect(verifyTurnstile("token")).resolves.toBe("人机验证未通过，请重试");
    stubSiteverify({ success: true, action: "login", hostname: "dash.example.com" });
    await expect(verifyTurnstile("token")).resolves.toBeNull();
  });

  it("reports service unavailability on fetch and http errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("network down"))));
    await expect(verifyTurnstile("token")).resolves.toBe("人机验证服务暂时不可用，请稍后重试");

    stubSiteverify({}, { status: 500 });
    await expect(verifyTurnstile("token")).resolves.toBe("人机验证服务暂时不可用，请稍后重试");
  });
});
