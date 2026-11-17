import { and, asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import {
  listeners,
  nodes,
  pointerReferences,
  pointers,
  profileListeners,
  profileManualNodes,
  profileSubscriptions,
  profiles,
  proxyGroups,
  rules,
  subscriptions,
} from "@/db/schema";
import { createDb } from "@/db/client";
import { deleteProfiles, deleteRules, duplicateProfile, saveGroup, saveRule } from "./profiles";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/auth", () => ({ requireAuth: async () => {} }));
vi.mock("@/db", async () => {
  const actual = await import("@/db");
  return { ...actual, getDb: async () => db };
});

let db: Db;
let profileId: number;
let subscriptionId: number;

beforeEach(async () => {
  db = await createDb("memory://");
  const [profile] = await db.insert(profiles).values({ name: "Main", token: "main" }).returning();
  const [sub] = await db.insert(subscriptions).values({ name: "Air", url: "https://example.com/sub" }).returning();
  profileId = profile.id;
  subscriptionId = sub.id;
  await db.insert(profileSubscriptions).values({ profileId, subscriptionId, sort: 0 });
}, 60_000);

function groupYaml(name: string, subscription = "Air") {
  return `name: ${name}\ntype: select\noptions: {}\nmembers:\n  items: [DIRECT]\n  sources:\n    all: false\n    subscriptions: [${subscription}]\n    manual: true\n`;
}

describe("saveGroup YAML action", () => {
  it("creates a group and resolves selected subscription names", async () => {
    expect(await saveGroup(profileId, groupYaml("Proxy"))).toEqual({ ok: true, data: undefined });
    const [group] = await db.select().from(proxyGroups).where(eq(proxyGroups.profileId, profileId));
    expect(group.name).toBe("Proxy");
    expect(group.members.sources.subscriptions).toEqual([subscriptionId]);

    const missing = await saveGroup(profileId, groupYaml("Other", "Missing"));
    expect(missing).toEqual({ ok: false, error: "订阅「Missing」不存在或未加入当前方案" });
    expect(await db.$count(proxyGroups)).toBe(1);

    expect(await saveGroup(profileId, groupYaml("All", "Stale").replace("all: false", "all: true"))).toEqual({
      ok: true,
      data: undefined,
    });
    const [all] = await db.select().from(proxyGroups).where(eq(proxyGroups.name, "All"));
    expect(all.members.sources.subscriptions).toEqual([]);
  });

  it("edits YAML while preserving rename cascades and listener copying", async () => {
    await saveGroup(profileId, groupYaml("Proxy"));
    const [group] = await db.select().from(proxyGroups).where(eq(proxyGroups.profileId, profileId));
    await db.insert(rules).values({ profileId, type: "MATCH", payload: "", target: "Proxy", sort: 0 });
    const [listener] = await db.insert(listeners).values({ name: "Shared", type: "mixed", port: 7890, proxy: "Proxy" }).returning();
    const [other] = await db.insert(profiles).values({ name: "Other", token: "other" }).returning();
    await db.insert(profileListeners).values([
      { profileId, listenerId: listener.id, sort: 0 },
      { profileId: other.id, listenerId: listener.id, sort: 0 },
    ]);

    expect(await saveGroup(profileId, groupYaml("Renamed"), group.id)).toEqual({ ok: true, data: undefined });
    const [updated] = await db.select().from(proxyGroups).where(eq(proxyGroups.id, group.id));
    expect(updated.name).toBe("Renamed");
    expect((await db.select().from(rules))[0].target).toBe("Renamed");
    const listenerRows = await db.select().from(listeners);
    expect(listenerRows.find((l) => l.id === listener.id)?.proxy).toBe("Proxy");
    expect(listenerRows.find((l) => l.name === "Shared 副本")?.proxy).toBe("Renamed");
  });
});

describe("saveRule", () => {
  it("accepts dividers without content or target and normalizes editor-only fields", async () => {
    expect(
      await saveRule({
        profileId,
        subRule: null,
        type: "DIVIDER",
        payload: "  国内流量  ",
        target: "stale",
        noResolve: true,
        enabled: true,
      }),
    ).toEqual({ ok: true, data: undefined });

    const [divider] = await db.select().from(rules);
    expect(divider).toMatchObject({ type: "DIVIDER", payload: "国内流量", target: "", noResolve: false, enabled: true });

    expect(
      await saveRule({
        profileId,
        subRule: null,
        type: "DIVIDER",
        payload: "",
        target: "",
        noResolve: false,
        enabled: true,
      }),
    ).toEqual({ ok: true, data: undefined });
    expect(await db.$count(rules)).toBe(2);
  });

  it("inserts new rules before MATCH and all trailing dividers", async () => {
    await db.insert(rules).values([
      { profileId, type: "DOMAIN", payload: "first.example", target: "DIRECT", sort: 0 },
      { profileId, type: "MATCH", payload: "", target: "DIRECT", sort: 1 },
      { profileId, type: "DIVIDER", payload: "one", target: "", sort: 2 },
      { profileId, type: "DIVIDER", payload: "two", target: "", sort: 3 },
    ]);

    expect(
      await saveRule({
        profileId,
        subRule: null,
        type: "DOMAIN",
        payload: "new.example",
        target: "DIRECT",
        noResolve: false,
        enabled: true,
      }),
    ).toEqual({ ok: true, data: undefined });

    const rows = await db.select().from(rules).orderBy(asc(rules.sort), asc(rules.id));
    expect(rows.map((row) => [row.type, row.payload, row.sort])).toEqual([
      ["DOMAIN", "first.example", 0],
      ["DOMAIN", "new.example", 1],
      ["MATCH", "", 2],
      ["DIVIDER", "one", 3],
      ["DIVIDER", "two", 4],
    ]);
  });

  it("appends MATCH after trailing dividers instead of moving the existing tail", async () => {
    await db.insert(rules).values([
      { profileId, type: "MATCH", payload: "", target: "DIRECT", sort: 0 },
      { profileId, type: "DIVIDER", payload: "tail", target: "", sort: 1 },
    ]);

    await saveRule({
      profileId,
      subRule: null,
      type: "MATCH",
      payload: "discarded",
      target: "REJECT",
      noResolve: false,
      enabled: true,
    });

    const rows = await db.select().from(rules).orderBy(asc(rules.sort), asc(rules.id));
    expect(rows.map((row) => [row.type, row.payload, row.target, row.sort])).toEqual([
      ["MATCH", "", "DIRECT", 0],
      ["DIVIDER", "tail", "", 1],
      ["MATCH", "", "REJECT", 2],
    ]);
  });
});

describe("deleteRules", () => {
  it("deletes only selected rules in the current profile and rule set", async () => {
    const [otherProfile] = await db.insert(profiles).values({ name: "Other", token: "other" }).returning();
    const inserted = await db
      .insert(rules)
      .values([
        { profileId, type: "DOMAIN", payload: "a.example", target: "DIRECT", sort: 0 },
        { profileId, type: "DIVIDER", payload: "国内流量", target: "", sort: 1 },
        { profileId, subRule: "work", type: "DOMAIN", payload: "work.example", target: "DIRECT", sort: 0 },
        { profileId: otherProfile.id, type: "DOMAIN", payload: "other.example", target: "DIRECT", sort: 0 },
      ])
      .returning();

    expect(
      await deleteRules(profileId, null, [inserted[0].id, inserted[0].id, inserted[1].id, inserted[2].id, inserted[3].id, 999]),
    ).toEqual({ ok: true, data: 2 });
    const remaining = await db.select().from(rules).orderBy(asc(rules.id));
    expect(remaining.map((row) => row.id)).toEqual([inserted[2].id, inserted[3].id]);
  });

  it("deletes rows from the selected sub-rule and rejects invalid id arrays", async () => {
    const inserted = await db
      .insert(rules)
      .values([
        { profileId, type: "MATCH", payload: "", target: "DIRECT", sort: 0 },
        { profileId, subRule: "work", type: "MATCH", payload: "", target: "DIRECT", sort: 0 },
      ])
      .returning();

    expect(await deleteRules(profileId, "work", [inserted[1].id])).toEqual({ ok: true, data: 1 });
    expect((await db.select().from(rules)).map((row) => row.id)).toEqual([inserted[0].id]);
    expect((await deleteRules(profileId, null, [])).ok).toBe(false);
    expect((await deleteRules(profileId, null, [inserted[0].id, 1.5])).ok).toBe(false);
    expect(await db.$count(rules)).toBe(1);
  });
});

describe("duplicateProfile", () => {
  it("copies private data and shared associations with a new name and token", async () => {
    const [pointer] = await db.insert(pointers).values({ name: "shared", value: "secret" }).returning();
    await db.update(profiles).set({ baseConfig: "password: *shared", updateInterval: 12 }).where(eq(profiles.id, profileId));
    const [node] = await db.insert(nodes).values({ name: "Node", type: "ss", config: { name: "Node", type: "ss" } }).returning();
    const [listener] = await db.insert(listeners).values({ name: "Shared", type: "mixed", port: 7890 }).returning();
    await db.insert(profileManualNodes).values({ profileId, nodeId: node.id, sort: 0 });
    await db.insert(profileListeners).values({ profileId, listenerId: listener.id, sort: 0 });
    await db.insert(proxyGroups).values({
      profileId,
      name: "Private",
      members: { items: [], sources: { all: false, subscriptions: [subscriptionId], manual: true } },
      yaml: "name: Private",
    });
    await db.insert(rules).values({ profileId, type: "MATCH", payload: "", target: "Private" });

    const result = await duplicateProfile(profileId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [copy] = await db.select().from(profiles).where(eq(profiles.id, result.data));
    expect(copy).toMatchObject({ name: "Main 副本", baseConfig: "password: *shared", updateInterval: 12 });
    expect(copy.token).not.toBe("main");

    expect(await db.select().from(profileSubscriptions).where(eq(profileSubscriptions.profileId, copy.id))).toHaveLength(1);
    expect(await db.select().from(profileManualNodes).where(eq(profileManualNodes.profileId, copy.id))).toHaveLength(1);
    expect(await db.select().from(profileListeners).where(eq(profileListeners.profileId, copy.id))).toHaveLength(1);
    expect(await db.$count(nodes)).toBe(1);
    expect(await db.$count(listeners)).toBe(1);

    const copiedGroups = await db.select().from(proxyGroups).where(eq(proxyGroups.profileId, copy.id));
    expect(copiedGroups).toHaveLength(1);
    expect(copiedGroups[0].name).toBe("Private");
    expect(await db.select().from(rules).where(eq(rules.profileId, copy.id))).toHaveLength(1);
    expect(
      await db
        .select()
        .from(pointerReferences)
        .where(and(eq(pointerReferences.resourceType, "profile"), eq(pointerReferences.resourceId, copy.id))),
    ).toEqual([{ pointerId: pointer.id, resourceType: "profile", resourceId: copy.id }]);

    expect((await duplicateProfile(profileId)).ok).toBe(true);
    expect(await db.select({ name: profiles.name }).from(profiles).where(eq(profiles.name, "Main 副本 2"))).toHaveLength(1);
  });
});

describe("deleteProfiles", () => {
  it("deduplicates ids and returns the number of profiles actually deleted", async () => {
    const inserted = await db.insert(profiles).values([{ name: "Two", token: "two" }, { name: "Three", token: "three" }]).returning();

    expect(await deleteProfiles([inserted[0].id, inserted[0].id, inserted[1].id, 999])).toEqual({ ok: true, data: 2 });
    expect(await db.select({ id: profiles.id }).from(profiles)).toEqual([{ id: profileId }]);
  });

  it("rejects empty and non-integer id arrays without deleting profiles", async () => {
    expect((await deleteProfiles([])).ok).toBe(false);
    expect((await deleteProfiles([profileId, 1.5])).ok).toBe(false);
    expect(await db.$count(profiles)).toBe(1);
  });

  it("cascades private data and associations while preserving shared resources", async () => {
    const [profile] = await db.insert(profiles).values({ name: "Disposable", token: "disposable" }).returning();
    const [listener] = await db.insert(listeners).values({ name: "Shared", type: "mixed", port: 7890 }).returning();
    await db.insert(profileSubscriptions).values({ profileId: profile.id, subscriptionId });
    await db.insert(profileListeners).values({ profileId: profile.id, listenerId: listener.id });
    await db.insert(proxyGroups).values({
      profileId: profile.id,
      name: "Private",
      members: { items: [], sources: { all: false, subscriptions: [subscriptionId], manual: false } },
    });
    await db.insert(rules).values({ profileId: profile.id, type: "MATCH", payload: "", target: "DIRECT" });

    expect(await deleteProfiles([profile.id])).toEqual({ ok: true, data: 1 });
    expect(await db.$count(proxyGroups, eq(proxyGroups.profileId, profile.id))).toBe(0);
    expect(await db.$count(rules, eq(rules.profileId, profile.id))).toBe(0);
    expect(await db.$count(profileSubscriptions, eq(profileSubscriptions.profileId, profile.id))).toBe(0);
    expect(await db.$count(profileListeners, eq(profileListeners.profileId, profile.id))).toBe(0);
    expect(await db.$count(subscriptions)).toBe(1);
    expect(await db.$count(listeners)).toBe(1);
  });
});
