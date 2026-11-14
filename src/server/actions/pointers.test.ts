import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { createDb } from "@/db/client";
import {
  listeners,
  nodes,
  pointerReferences,
  pointers,
  profileListeners,
  profileManualNodes,
  profiles,
  profileSubscriptions,
  proxyGroups,
  ruleProviders,
  rules,
  subscriptions,
} from "@/db/schema";
import { generateForProfile } from "@/server/profile-data";
import { syncPointerReferences } from "@/server/pointer-references";
import { createPointer, deletePointer, updatePointer } from "./pointers";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/auth", () => ({ requireAuth: async () => {} }));
vi.mock("@/db", async () => {
  const actual = await import("@/db");
  return { ...actual, getDb: async () => db };
});

let db: Db;

beforeEach(async () => {
  db = await createDb("memory://");
}, 60_000);

describe("pointer CRUD", () => {
  it("creates trimmed Unicode names and updates only the string password", async () => {
    const created = await createPointer("  共享密码_test-1  ", "first-secret\n");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const [before] = await db.select().from(pointers).where(eq(pointers.id, created.data));
    expect(before).toMatchObject({ name: "共享密码_test-1", value: "first-secret" });

    expect(await updatePointer(created.data, "second-secret\n")).toEqual({ ok: true, data: undefined });
    const [after] = await db.select().from(pointers).where(eq(pointers.id, created.data));
    expect(after.name).toBe(before.name);
    expect(after.value).toBe("second-secret");
  });

  it("rejects invalid and duplicate names and invalid or non-string YAML values", async () => {
    for (const name of ["", "1invalid", "_invalid", "-invalid", "has space", "invalid.name"]) {
      expect((await createPointer(name, "value")).ok).toBe(false);
    }
    for (const value of ["[", "null", "42", "true", "[secret]", "password: secret", ".nan", ".inf"]) {
      expect((await createPointer("valid", value)).ok).toBe(false);
    }
    expect(await db.$count(pointers)).toBe(0);

    expect((await createPointer("valid", "value")).ok).toBe(true);
    expect(await createPointer("valid", "other")).toEqual({ ok: false, error: "名称已存在" });
    expect(await db.$count(pointers)).toBe(1);
  });

  it("deletes an unreferenced pointer", async () => {
    const created = await createPointer("unused", "value");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(await deletePointer(created.data)).toEqual({ ok: true, data: undefined });
    expect(await db.$count(pointers)).toBe(0);
  });
});

describe("deletePointer materialization", () => {
  it("materializes password references while preserving other aliases and generated output", async () => {
    const shared = await createPointer("shared", "shared-secret");
    const kept = await createPointer("kept", "kept-secret");
    expect(shared.ok && kept.ok).toBe(true);
    if (!shared.ok || !kept.ok) return;

    const baseConfig = `# base comment
mixed-port: 7890
password: *shared
dns:
  password: *kept
`;
    const insertedProfiles = await db
      .insert(profiles)
      .values([
        { name: "One", token: "one", baseConfig },
        { name: "Two", token: "two", baseConfig },
      ])
      .returning();

    const [subscription] = await db
      .insert(subscriptions)
      .values({
        name: "Air",
        url: "https://example.com/stale",
        mode: "provider",
        processing: { prefix: "stale" },
        yaml: `name: Air
url: https://example.com/shared
userAgent: clash.meta
enabled: true
cacheTtl: 3600
providerOptions:
  interval: 1200
processing:
  prefix: kept-value
`,
      })
      .returning();
    const [node] = await db
      .insert(nodes)
      .values({
        subscriptionId: null,
        name: "Shared node",
        type: "ss",
        config: { name: "Shared node", type: "ss", server: "stale", port: 443 },
        yaml: `# node comment
name: Shared node
type: ss
server: node.example.com
port: 443
password: *shared
cipher: aes-128-gcm
nested:
  password: *kept
`,
      })
      .returning();
    const [listener] = await db
      .insert(listeners)
      .values({
        name: "Shared listener",
        type: "mixed",
        port: 7891,
        proxy: "Proxy",
        yaml: `name: Shared listener
type: mixed
listen: 0.0.0.0
port: 7891
proxy: Proxy
password: *shared
nested:
  password: *kept
`,
      })
      .returning();

    await db.insert(profileSubscriptions).values(
      insertedProfiles.map((profile, sort) => ({ profileId: profile.id, subscriptionId: subscription.id, sort })),
    );
    await db.insert(profileManualNodes).values(insertedProfiles.map((profile) => ({ profileId: profile.id, nodeId: node.id })));
    await db.insert(profileListeners).values(insertedProfiles.map((profile) => ({ profileId: profile.id, listenerId: listener.id })));

    const groupYaml = `name: Proxy
type: select
options:
  icon: https://example.com/icon.png
  url: https://example.com/generate_204
members:
  items: [Shared node, DIRECT]
  sources:
    all: false
    subscriptions: [Air]
    manual: false
`;
    const insertedGroups = await db
      .insert(proxyGroups)
      .values(
        insertedProfiles.map((profile) => ({
          profileId: profile.id,
          name: "Proxy",
          type: "select" as const,
          options: { icon: "stale", url: "stale" },
          members: {
            items: ["Shared node", "DIRECT"],
            sources: { all: false, subscriptions: [subscription.id], manual: false },
          },
          yaml: groupYaml,
        })),
      )
      .returning();
    const [provider] = await db
      .insert(ruleProviders)
      .values({
        name: "Shared-rules",
        type: "http",
        behavior: "domain",
        format: "yaml",
        url: "https://example.com/stale-rules",
        interval: 600,
        yaml: `name: Shared-rules
type: http
behavior: domain
format: yaml
url: https://example.com/shared-rules
interval: 600
path: ./rules/shared.yaml
password: *shared
nested:
  password: *kept
`,
      })
      .returning();
    await db.insert(rules).values(
      insertedProfiles.flatMap((profile) => [
        { profileId: profile.id, type: "RULE-SET", payload: "Shared-rules", target: "Proxy", sort: 0 },
        { profileId: profile.id, type: "MATCH", payload: "", target: "DIRECT", sort: 1 },
      ]),
    );

    for (const profile of insertedProfiles) await syncPointerReferences(db, "profile", profile.id, baseConfig);
    await syncPointerReferences(db, "node", node.id, node.yaml);
    await syncPointerReferences(db, "listener", listener.id, listener.yaml);
    for (const group of insertedGroups) await syncPointerReferences(db, "group", group.id, group.yaml);
    await syncPointerReferences(db, "subscription", subscription.id, subscription.yaml);
    await syncPointerReferences(db, "ruleProvider", provider.id, provider.yaml);

    const before = await Promise.all(insertedProfiles.map((profile) => generateForProfile(db, profile)));
    expect(before.map(({ result }) => result.errors)).toEqual([[], []]);
    expect(before[0].result.yaml).toBe(before[1].result.yaml);

    expect(await deletePointer(shared.data)).toEqual({ ok: true, data: undefined });

    const afterProfiles = await db.select().from(profiles).orderBy(profiles.id);
    const after = await Promise.all(afterProfiles.map((profile) => generateForProfile(db, profile)));
    expect(after.map(({ result }) => result.errors)).toEqual([[], []]);
    expect(after.map(({ result }) => result.yaml)).toEqual(before.map(({ result }) => result.yaml));

    for (const profile of afterProfiles) {
      expect(profile.baseConfig).toContain("# base comment");
      expect(profile.baseConfig).toContain("password: shared-secret");
      expect(profile.baseConfig).toContain("password: *kept");
      expect(profile.baseConfig).not.toContain("*shared");
    }
    const [updatedNode] = await db.select().from(nodes).where(eq(nodes.id, node.id));
    expect(updatedNode.config).toMatchObject({
      server: "node.example.com",
      password: "shared-secret",
      nested: { password: "kept-secret" },
    });
    expect(updatedNode.yaml).toContain("# node comment");
    expect(updatedNode.yaml).toContain("password: *kept");
    expect(updatedNode.yaml).not.toContain("*shared");

    const [updatedListener] = await db.select().from(listeners).where(eq(listeners.id, listener.id));
    expect(updatedListener.options).toEqual({ password: "shared-secret", nested: { password: "kept-secret" } });
    expect(updatedListener.yaml).toContain("password: *kept");
    expect(updatedListener.yaml).not.toContain("*shared");

    const updatedGroups = await db.select().from(proxyGroups).orderBy(proxyGroups.id);
    for (const group of updatedGroups) {
      expect(group.members.sources.subscriptions).toEqual([subscription.id]);
      expect(group.yaml).toBe(groupYaml);
    }

    const [updatedSubscription] = await db.select().from(subscriptions).where(eq(subscriptions.id, subscription.id));
    expect(updatedSubscription.url).toBe("https://example.com/stale");
    expect(updatedSubscription.yaml).toContain("prefix: kept-value");

    const [updatedProvider] = await db.select().from(ruleProviders).where(eq(ruleProviders.id, provider.id));
    expect(updatedProvider.url).toBe("https://example.com/shared-rules");
    expect(updatedProvider.options).toEqual({
      path: "./rules/shared.yaml",
      password: "shared-secret",
      nested: { password: "kept-secret" },
    });
    expect(updatedProvider.yaml).toContain("password: *kept");
    expect(updatedProvider.yaml).not.toContain("*shared");

    const refs = await db.select().from(pointerReferences);
    expect(refs).toHaveLength(5);
    expect(refs.every((ref) => ref.pointerId === kept.data)).toBe(true);
    expect(Object.fromEntries(refs.map((ref) => [ref.resourceType, 1]))).toEqual({
      profile: 1,
      node: 1,
      listener: 1,
      ruleProvider: 1,
    });
    expect(await db.$count(pointers, eq(pointers.id, shared.data))).toBe(0);
  });

  it("rolls back earlier materializations if a later referenced resource cannot be reparsed", async () => {
    const created = await createPointer("shared", "value");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const originalBase = "mixed-port: 7890\npassword: *shared\n";
    const [profile] = await db.insert(profiles).values({ name: "One", token: "one", baseConfig: originalBase }).returning();
    const listenerYaml = "name: Broken\ntype: mixed\npassword: *shared\n";
    const [listener] = await db
      .insert(listeners)
      .values({ name: "Broken", type: "mixed", port: 7891, yaml: listenerYaml })
      .returning();
    await syncPointerReferences(db, "profile", profile.id, originalBase);
    await syncPointerReferences(db, "listener", listener.id, listenerYaml);

    const result = await deletePointer(created.data);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("port");
    const [unchanged] = await db.select().from(profiles).where(eq(profiles.id, profile.id));
    expect(unchanged.baseConfig).toBe(originalBase);
    expect(await db.$count(pointers, eq(pointers.id, created.data))).toBe(1);
    expect(await db.$count(pointerReferences, eq(pointerReferences.pointerId, created.data))).toBe(2);
  });
});
