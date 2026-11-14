import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { createDb } from "@/db/client";
import {
  listeners,
  nodes,
  profileListeners,
  profileManualNodes,
  profiles,
  profileSubscriptions,
  proxyGroups,
  ruleProviders,
  rules,
  subscriptions,
} from "@/db/schema";
import { deleteListener, deleteListeners } from "./listeners";
import { deleteManualNode, deleteManualNodes } from "./nodes";
import { deleteRuleProvider, deleteRuleProviders } from "./rule-providers";
import { deleteSubscription, deleteSubscriptions } from "./subscriptions";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/auth", () => ({ requireAuth: async () => {} }));
vi.mock("@/server/fetcher", () => ({ refreshMany: vi.fn(), refreshSubscription: vi.fn() }));
vi.mock("@/db", async () => {
  const actual = await import("@/db");
  return { ...actual, getDb: async () => db };
});

let db: Db;

beforeEach(async () => {
  db = await createDb("memory://");
}, 60_000);

function nodeValues(name: string, subscriptionId: number | null = null) {
  return {
    subscriptionId,
    name,
    type: "ss",
    config: { name, type: "ss", server: "192.0.2.1", port: 8388 },
  };
}

describe("batch resource deletion", () => {
  it("deletes subscriptions once and cleans snapshots, profile links, and every selected group source", async () => {
    const [profile] = await db.insert(profiles).values({ name: "Main", token: "main" }).returning();
    const [a, b, c] = await db
      .insert(subscriptions)
      .values([
        { name: "A", url: "https://example.com/a" },
        { name: "B", url: "https://example.com/b" },
        { name: "C", url: "https://example.com/c" },
      ])
      .returning();
    await db.insert(nodes).values([nodeValues("A node", a.id), nodeValues("B node", b.id), nodeValues("C node", c.id), nodeValues("Manual")]);
    await db.insert(profileSubscriptions).values([
      { profileId: profile.id, subscriptionId: a.id },
      { profileId: profile.id, subscriptionId: b.id },
      { profileId: profile.id, subscriptionId: c.id },
    ]);
    await db.insert(proxyGroups).values([
      {
        profileId: profile.id,
        name: "AB",
        members: { items: [], sources: { all: false, subscriptions: [a.id, b.id], manual: false } },
      },
      {
        profileId: profile.id,
        name: "C",
        members: { items: [], sources: { all: false, subscriptions: [c.id], manual: false } },
      },
    ]);

    expect(await deleteSubscriptions([a.id, a.id, b.id, 999_999])).toEqual({ ok: true, data: 2 });
    expect((await db.select().from(subscriptions)).map((row) => row.name)).toEqual(["C"]);
    expect((await db.select().from(nodes)).map((row) => row.name).sort()).toEqual(["C node", "Manual"]);
    expect((await db.select().from(profileSubscriptions)).map((row) => row.subscriptionId)).toEqual([c.id]);
    const groups = await db.select().from(proxyGroups);
    expect(groups.find((group) => group.name === "AB")?.members.sources.subscriptions).toEqual([]);
    expect(groups.find((group) => group.name === "C")?.members.sources.subscriptions).toEqual([c.id]);

    expect(await deleteSubscription(c.id)).toEqual({ ok: true, data: undefined });
    expect(await db.$count(subscriptions)).toBe(0);
    expect((await db.select().from(nodes)).map((row) => row.name)).toEqual(["Manual"]);
    expect((await db.select().from(proxyGroups)).every((group) => group.members.sources.subscriptions.length === 0)).toBe(true);
  });

  it("never deletes subscription snapshots through either manual-node deletion entry", async () => {
    const [subscription] = await db.insert(subscriptions).values({ name: "Air", url: "https://example.com/air" }).returning();
    const [profile] = await db.insert(profiles).values({ name: "Main", token: "main" }).returning();
    const [manual, snapshot, otherManual] = await db
      .insert(nodes)
      .values([nodeValues("Manual"), nodeValues("Snapshot", subscription.id), nodeValues("Other manual")])
      .returning();
    await db.insert(profileManualNodes).values([
      { profileId: profile.id, nodeId: manual.id },
      { profileId: profile.id, nodeId: otherManual.id },
    ]);

    expect(await deleteManualNodes([manual.id, manual.id, snapshot.id, 999_999])).toEqual({ ok: true, data: 1 });
    expect((await db.select().from(nodes)).map((row) => row.name).sort()).toEqual(["Other manual", "Snapshot"]);
    expect(await db.$count(profileManualNodes, eq(profileManualNodes.nodeId, manual.id))).toBe(0);

    expect(await deleteManualNode(snapshot.id)).toEqual({ ok: true, data: undefined });
    expect(await db.$count(nodes, eq(nodes.id, snapshot.id))).toBe(1);
    expect(await deleteManualNode(otherManual.id)).toEqual({ ok: true, data: undefined });
    expect((await db.select().from(nodes)).map((row) => row.name)).toEqual(["Snapshot"]);
  });

  it("cascades listener associations and preserves the single-delete entry", async () => {
    const [profile] = await db.insert(profiles).values({ name: "Main", token: "main" }).returning();
    const [a, b, c] = await db
      .insert(listeners)
      .values([
        { name: "A", type: "mixed", port: 7890 },
        { name: "B", type: "mixed", port: 7891 },
        { name: "C", type: "mixed", port: 7892 },
      ])
      .returning();
    await db.insert(profileListeners).values([
      { profileId: profile.id, listenerId: a.id },
      { profileId: profile.id, listenerId: b.id },
      { profileId: profile.id, listenerId: c.id },
    ]);

    expect(await deleteListeners([a.id, a.id, b.id, 999_999])).toEqual({ ok: true, data: 2 });
    expect((await db.select().from(listeners)).map((row) => row.name)).toEqual(["C"]);
    expect((await db.select().from(profileListeners)).map((row) => row.listenerId)).toEqual([c.id]);

    expect(await deleteListener(c.id)).toEqual({ ok: true, data: undefined });
    expect(await db.$count(listeners)).toBe(0);
    expect(await db.$count(profileListeners)).toBe(0);
  });

  it("rolls back the whole rule-provider batch and lists every reference", async () => {
    const [profile] = await db.insert(profiles).values({ name: "Main", token: "main" }).returning();
    const [a, b, c, d] = await db
      .insert(ruleProviders)
      .values([{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }])
      .returning();
    await db.insert(rules).values([
      { profileId: profile.id, type: "RULE-SET", payload: "A", target: "DIRECT" },
      { profileId: profile.id, type: "RULE-SET", payload: "A", target: "DIRECT" },
      { profileId: profile.id, type: "RULE-SET", payload: "C", target: "DIRECT" },
      { profileId: profile.id, type: "DOMAIN", payload: "A", target: "DIRECT" },
    ]);

    const blocked = await deleteRuleProviders([a.id, b.id, c.id]);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error).toContain("规则集「A」仍被 2 条规则引用");
    expect(blocked.error).toContain("规则集「C」仍被 1 条规则引用");
    expect(await db.$count(ruleProviders)).toBe(4);
    expect(await db.$count(rules)).toBe(4);

    expect(await deleteRuleProviders([b.id, b.id, d.id, 999_999])).toEqual({ ok: true, data: 2 });
    expect((await db.select().from(ruleProviders)).map((row) => row.name).sort()).toEqual(["A", "C"]);
    expect(await deleteRuleProvider(a.id)).toEqual({ ok: false, error: "规则集「A」仍被 2 条规则引用" });
    expect(await db.$count(ruleProviders, eq(ruleProviders.id, a.id))).toBe(1);
  });

  it("rejects empty ID arrays before issuing a delete", async () => {
    for (const remove of [deleteSubscriptions, deleteManualNodes, deleteListeners, deleteRuleProviders]) {
      const result = await remove([]);
      expect(result.ok).toBe(false);
    }
    expect(await deleteManualNodes([1.5])).toMatchObject({ ok: false });
    expect(await Promise.all([db.$count(subscriptions), db.$count(nodes), db.$count(listeners), db.$count(ruleProviders)])).toEqual([
      0, 0, 0, 0,
    ]);
  });
});
