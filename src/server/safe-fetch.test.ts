import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async (hostname: string) => {
    if (hostname === "public.example") return [{ address: "93.184.216.34", family: 4 }];
    if (hostname === "internal.example") return [{ address: "192.168.1.10", family: 4 }];
    if (hostname === "mixed.example") {
      return [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.5", family: 4 },
      ];
    }
    throw new Error(`ENOTFOUND ${hostname}`);
  }),
}));

import { assertUrlAllowed, fetchTextWithGuards } from "./safe-fetch";

const oldAllowPrivate = process.env.SUBSCRIPTION_ALLOW_PRIVATE_NETWORK;
const oldMaxBytes = process.env.SUBSCRIPTION_MAX_BYTES;

afterEach(() => {
  vi.unstubAllGlobals();
  if (oldAllowPrivate === undefined) delete process.env.SUBSCRIPTION_ALLOW_PRIVATE_NETWORK;
  else process.env.SUBSCRIPTION_ALLOW_PRIVATE_NETWORK = oldAllowPrivate;
  if (oldMaxBytes === undefined) delete process.env.SUBSCRIPTION_MAX_BYTES;
  else process.env.SUBSCRIPTION_MAX_BYTES = oldMaxBytes;
});

describe("assertUrlAllowed", () => {
  it("rejects non-http protocols and invalid URLs", async () => {
    await expect(assertUrlAllowed("ftp://example.com/sub")).rejects.toThrow("仅支持 http/https");
    await expect(assertUrlAllowed("file:///etc/passwd")).rejects.toThrow("仅支持 http/https");
    await expect(assertUrlAllowed("not a url")).rejects.toThrow("订阅地址无效");
  });

  it("rejects loopback, private, link-local and reserved IP literals", async () => {
    for (const url of [
      "http://127.0.0.1/sub",
      "http://10.0.0.1/sub",
      "http://192.168.1.1/sub",
      "http://172.16.0.1/sub",
      "http://169.254.169.254/latest/meta-data",
      "http://100.64.0.1/sub",
      "http://0.0.0.0/sub",
      "http://[::1]/sub",
      "http://[fe80::1]/sub",
      "http://[fc00::1]/sub",
      "http://[::ffff:127.0.0.1]/sub",
    ]) {
      await expect(assertUrlAllowed(url)).rejects.toThrow("内网或保留地址");
    }
  });

  it("rejects localhost-style hostnames", async () => {
    await expect(assertUrlAllowed("http://localhost:8080/sub")).rejects.toThrow("内网或保留地址");
    await expect(assertUrlAllowed("http://app.localhost/sub")).rejects.toThrow("内网或保留地址");
    await expect(assertUrlAllowed("http://converter.internal/sub")).rejects.toThrow("内网或保留地址");
  });

  it("allows public IP literals and publicly resolving hostnames", async () => {
    expect((await assertUrlAllowed("https://93.184.216.34/sub")).hostname).toBe("93.184.216.34");
    expect((await assertUrlAllowed("https://public.example/sub")).hostname).toBe("public.example");
  });

  it("rejects hostnames resolving to any blocked address", async () => {
    await expect(assertUrlAllowed("https://internal.example/sub")).rejects.toThrow("内网或保留地址");
    await expect(assertUrlAllowed("https://mixed.example/sub")).rejects.toThrow("内网或保留地址");
    await expect(assertUrlAllowed("https://missing.example/sub")).rejects.toThrow("域名解析失败");
  });

  it("allows private addresses when SUBSCRIPTION_ALLOW_PRIVATE_NETWORK=1", async () => {
    process.env.SUBSCRIPTION_ALLOW_PRIVATE_NETWORK = "1";
    expect((await assertUrlAllowed("http://192.168.1.10:8080/sub")).hostname).toBe("192.168.1.10");
    expect((await assertUrlAllowed("http://localhost/sub")).hostname).toBe("localhost");
    await expect(assertUrlAllowed("ftp://192.168.1.10/sub")).rejects.toThrow("仅支持 http/https");
  });
});

describe("fetchTextWithGuards", () => {
  it("follows redirects manually and re-validates every hop", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://public.example/sub") {
        return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/inner" } });
      }
      return new Response("should not be fetched");
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchTextWithGuards("https://public.example/sub", { timeoutMs: 5000 })).rejects.toThrow(
      "内网或保留地址",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts when the body exceeds the size cap", async () => {
    process.env.SUBSCRIPTION_MAX_BYTES = "16";
    process.env.SUBSCRIPTION_ALLOW_PRIVATE_NETWORK = "1";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x".repeat(64))));
    await expect(fetchTextWithGuards("http://192.168.1.10/sub", { timeoutMs: 5000 })).rejects.toThrow("大小上限");
  });

  it("returns body text and headers for allowed responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("hello", { headers: { "subscription-userinfo": "upload=1; download=2; total=3" } })),
    );
    const result = await fetchTextWithGuards("https://public.example/sub", { timeoutMs: 5000 });
    expect(result.text).toBe("hello");
    expect(result.headers.get("subscription-userinfo")).toContain("upload=1");
  });
});
