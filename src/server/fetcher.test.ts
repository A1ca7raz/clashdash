import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDb } from "@/db/client";
import { nodes, subscriptions } from "@/db/schema";
import { refreshSubscription } from "./fetcher";

// safe-fetch resolves hostnames before connecting; tests use a fixed public address.
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

afterEach(() => vi.unstubAllGlobals());

async function setup() {
  const db = await createDb("memory://");
  const [sub] = await db.insert(subscriptions).values({ name: "Air", url: "https://example.com/sub" }).returning();
  await db.insert(nodes).values({
    subscriptionId: sub.id,
    name: "Old",
    type: "ss",
    config: { name: "Old", type: "ss", server: "192.0.2.1", port: 8388 },
  });
  await db.update(subscriptions).set({ nodeCount: 1 }).where(eq(subscriptions.id, sub.id));
  return { db, sub: { ...sub, nodeCount: 1 } };
}

const subscriptionYaml = `proxies:
  - {name: New, type: ss, server: 192.0.2.2, port: 8388, cipher: aes-128-gcm, password: p}
`;

const changedSubscriptionYaml = `proxies:
  - {name: Changed, type: ss, server: 192.0.2.3, port: 8388, cipher: aes-128-gcm, password: p}
`;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("subscription refresh lock", () => {
  it("coalesces concurrent refreshes and releases the lease", async () => {
    const { db, sub } = await setup();
    let requests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        requests++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return new Response(subscriptionYaml);
      }),
    );

    const results = await Promise.all([refreshSubscription(db, sub), refreshSubscription(db, sub)]);
    expect(requests).toBe(1);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await db.$count(nodes, eq(nodes.subscriptionId, sub.id))).toBe(1);
    expect((await db.select().from(nodes))[0].name).toBe("New");
    expect((await db.select().from(subscriptions))[0].refreshingAt).toBeNull();
  }, 60_000);

  it("keeps old nodes on failure and allows a later retry", async () => {
    const { db, sub } = await setup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("blocked", { status: 503 })));
    const failed = await refreshSubscription(db, sub);
    expect(failed.ok).toBe(false);
    expect((await db.select().from(nodes))[0].name).toBe("Old");
    expect((await db.select().from(subscriptions))[0].refreshingAt).toBeNull();

    vi.stubGlobal("fetch", vi.fn(async () => new Response(subscriptionYaml)));
    const [latest] = await db.select().from(subscriptions);
    const retried = await refreshSubscription(db, latest);
    expect(retried.ok).toBe(true);
    expect((await db.select().from(nodes))[0].name).toBe("New");
  }, 60_000);

  it("aborts an in-flight old-config write and refreshes the changed config", async () => {
    const { db, sub } = await setup();
    const aStarted = deferred();
    const releaseA = deferred();
    const bStarted = deferred();
    const releaseB = deferred();
    const changedUrl = "https://example.com/changed";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === sub.url) {
        aStarted.resolve();
        await releaseA.promise;
        return new Response(subscriptionYaml, {
          headers: { "subscription-userinfo": "upload=1; download=2; total=3" },
        });
      }
      bStarted.resolve();
      await releaseB.promise;
      return new Response(changedSubscriptionYaml);
    });
    vi.stubGlobal("fetch", fetchMock);

    const refreshingA = refreshSubscription(db, sub);
    await aStarted.promise;
    await db
      .update(subscriptions)
      .set({ url: changedUrl, userAgent: "changed-agent" })
      .where(eq(subscriptions.id, sub.id));
    const [changedSub] = await db.select().from(subscriptions);
    const refreshingB = refreshSubscription(db, changedSub, 5000);

    releaseA.resolve();
    const resultA = await refreshingA;
    const earlyBResult = await Promise.race([bStarted.promise.then(() => null), refreshingB]);
    expect(earlyBResult).toBeNull();
    expect(resultA.ok).toBe(false);
    expect((await db.select().from(nodes))[0].name).toBe("Old");
    const [afterA] = await db.select().from(subscriptions);
    expect(afterA.nodeCount).toBe(1);
    expect(afterA.userinfo).toBeNull();
    expect(afterA.lastAttemptAt).toBeNull();
    expect(afterA.lastFetchedAt).toBeNull();
    expect(afterA.lastError).toBeNull();

    releaseB.resolve();
    const resultB = await refreshingB;
    expect(resultB).toMatchObject({ ok: true, count: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await db.select().from(nodes))[0].name).toBe("Changed");
    const [afterB] = await db.select().from(subscriptions);
    expect(afterB.url).toBe(changedUrl);
    expect(afterB.userAgent).toBe("changed-agent");
    expect(afterB.refreshingAt).toBeNull();
  }, 60_000);

  it("returns an explicit error when waiting for the lock times out", async () => {
    const { db, sub } = await setup();
    await db.update(subscriptions).set({ refreshingAt: new Date() }).where(eq(subscriptions.id, sub.id));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await refreshSubscription(db, sub, 30);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("等待订阅刷新超时");
    expect(fetchMock).not.toHaveBeenCalled();
  }, 60_000);
});
