import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { createDb } from "@/db/client";
import { pointerReferences, pointers, subscriptions } from "@/db/schema";
import { saveProviderSubscription, saveSubscription } from "./subscriptions";

const fetcher = vi.hoisted(() => ({ refreshSubscription: vi.fn(), refreshMany: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/auth", () => ({ requireAuth: async () => {} }));
vi.mock("@/server/fetcher", () => fetcher);
vi.mock("@/db", async () => {
  const actual = await import("@/db");
  return { ...actual, getDb: async () => db };
});

let db: Db;

beforeEach(async () => {
  fetcher.refreshSubscription.mockReset().mockResolvedValue(undefined);
  fetcher.refreshMany.mockReset();
  db = await createDb("memory://");
}, 60_000);

function providerYaml(url = "https://example.com/sub", userAgent = "clash.meta") {
  return `name: Air\nurl: ${url}\nuserAgent: ${userAgent}\nenabled: true\nrefreshInterval: 3600\nproviderOptions:\n  interval: 1800\n  healthCheck:\n    enable: true\n    lazy: true\nprocessing:\n  include: " 香港 "\n  rename:\n    - pattern: HK\n      target: 香港\n`;
}

describe("subscription YAML action", () => {
  it("creates a provider from YAML and refreshes it", async () => {
    const result = await saveProviderSubscription(providerYaml());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, result.data));
    expect(row).toMatchObject({
      name: "Air",
      mode: "provider",
      providerOptions: { interval: 1800, healthCheck: { enable: true, lazy: true } },
      processing: { include: "香港", rename: [{ pattern: "HK", target: "香港" }] },
    });
    expect(fetcher.refreshSubscription).toHaveBeenCalledOnce();
  });

  it("returns YAML validation errors as action results", async () => {
    const result = await saveProviderSubscription("name: Air\nurl: invalid");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("url");
    expect(fetcher.refreshSubscription).not.toHaveBeenCalled();
  });

  it("refreshes edits only when URL or User-Agent changes", async () => {
    const created = await saveProviderSubscription(providerYaml());
    if (!created.ok) throw new Error(created.error);
    fetcher.refreshSubscription.mockClear();

    expect(await saveProviderSubscription(providerYaml().replace("refreshInterval: 3600", "refreshInterval: 7200"), created.data)).toMatchObject({
      ok: true,
    });
    expect(fetcher.refreshSubscription).not.toHaveBeenCalled();

    expect(await saveProviderSubscription(providerYaml("https://example.com/new"), created.data)).toMatchObject({ ok: true });
    expect(fetcher.refreshSubscription).toHaveBeenCalledOnce();
  });

  it("rejects non-password pointers and preserves provider YAML until an inline save", async () => {
    await db.insert(pointers).values({ name: "endpoint", value: "https://example.com/sub" });
    const rejected = await saveProviderSubscription(providerYaml("*endpoint"));
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.error).toContain("只能作为 password 字段的值");
    expect(await db.$count(subscriptions)).toBe(0);
    expect(await db.select().from(pointerReferences)).toEqual([]);

    const text = providerYaml();
    const created = await saveProviderSubscription(text);
    if (!created.ok) throw new Error(created.error);
    const [provider] = await db.select().from(subscriptions).where(eq(subscriptions.id, created.data));
    expect(provider.url).toBe("https://example.com/sub");
    expect(provider.yaml).toBe(text);

    const inline = await saveSubscription({
      id: created.data,
      name: "Air",
      url: "https://example.com/sub",
      userAgent: "clash.meta",
      enabled: true,
      mode: "inline",
      refreshInterval: 3600,
      processing: {},
      providerOptions: {},
    });
    expect(inline.ok).toBe(true);
    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, created.data));
    expect(row.yaml).toBeNull();
    expect(await db.select().from(pointerReferences)).toEqual([]);
  });

  it("keeps the existing inline form save path", async () => {
    const result = await saveSubscription({
      name: "Inline",
      url: "https://example.com/inline",
      userAgent: "clash.meta",
      enabled: true,
      mode: "inline",
      refreshInterval: 3600,
      processing: {},
      providerOptions: {},
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, result.data));
    expect(row.mode).toBe("inline");
    expect(fetcher.refreshSubscription).toHaveBeenCalledOnce();
  });
});
