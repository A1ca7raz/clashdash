import { asc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { createDb, type Db } from "@/db/client";
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
import { DEFAULT_BASE_CONFIG } from "@/lib/base-config";
import { exportAll, importAll } from "./backup";
import { syncPointerReferences } from "./pointer-references";
import { generateForProfile, loadProfileResources, renameGroup, renameSubRule, updateManualNodeConfig } from "./profile-data";

let db: Db;
let profileId: number;

beforeAll(async () => {
  db = await createDb("memory://");
  const [sub] = await db
    .insert(subscriptions)
    .values({ name: "Air", url: "https://example.com/sub", processing: { flag: true } })
    .returning();
  await db.insert(nodes).values(
    ["香港 01", "日本 01"].map((name, i) => ({
      subscriptionId: sub.id,
      name,
      type: "ss",
      config: { name, type: "ss", server: "s", port: 1000 + i, cipher: "aes-128-gcm", password: "p" },
      sort: i,
    })),
  );
  const [p] = await db.insert(profiles).values({ name: "Main", token: "t", baseConfig: DEFAULT_BASE_CONFIG }).returning();
  profileId = p.id;
  await db.insert(profileSubscriptions).values({ profileId, subscriptionId: sub.id, sort: 0 });
  await db.insert(ruleProviders).values({
    name: "geosite-cn",
    behavior: "domain",
    format: "mrs",
    url: "https://example.com/geosite-cn.mrs",
  });
  await db.insert(proxyGroups).values([
    {
      profileId,
      name: "🚀 节点选择",
      type: "select",
      members: { items: ["DIRECT"], sources: { all: true, subscriptions: [], manual: true } },
      sort: 0,
    },
    {
      profileId,
      name: "🐟 漏网之鱼",
      type: "select",
      members: { items: ["🚀 节点选择", "DIRECT"], sources: { all: false, subscriptions: [], manual: false } },
      sort: 1,
    },
  ]);
  await db.insert(rules).values([
    { profileId, type: "RULE-SET", payload: "geosite-cn", target: "DIRECT", sort: 0 },
    { profileId, type: "DIVIDER", payload: "备用线路", target: "", sort: 1 },
    { profileId, type: "MATCH", payload: "", target: "🐟 漏网之鱼", sort: 2 },
  ]);
}, 60_000);

describe("database flow (PGlite)", () => {
  it("loads associations and generates a valid config from explicit fixtures", async () => {
    const resources = await loadProfileResources(db, profileId);
    expect(resources.subscriptionIds).toHaveLength(1);
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId));
    const { result } = await generateForProfile(db, profile);
    expect(result.errors).toEqual([]);
    const cfg = parse(result.yaml);
    expect(cfg.proxies.map((p: { name: string }) => p.name)).toEqual(["🇭🇰 香港 01", "🇯🇵 日本 01"]);
    expect(Object.keys(cfg["rule-providers"])).toContain("geosite-cn");
    expect(cfg.rules.at(-1)).toBe("MATCH,🐟 漏网之鱼");
  });

  it("copies shared listeners when groups and sub-rules are renamed", async () => {
    const [own, shared, sharedSub] = await db
      .insert(listeners)
      .values([
        { name: "own", type: "mixed", port: 7899, proxy: "🚀 节点选择" },
        { name: "shared", type: "mixed", port: 7898, proxy: "🚀 节点选择" },
        { name: "shared-sub", type: "mixed", port: 7897, subRule: "work" },
      ])
      .returning();
    await db.insert(profileListeners).values([
      { profileId, listenerId: own.id, sort: 0 },
      { profileId, listenerId: shared.id, sort: 1 },
      { profileId, listenerId: sharedSub.id, sort: 2 },
    ]);
    const [other] = await db.insert(profiles).values({ name: "Other", token: "t2" }).returning();
    await db.insert(profileListeners).values([
      { profileId: other.id, listenerId: shared.id, sort: 0 },
      { profileId: other.id, listenerId: sharedSub.id, sort: 1 },
    ]);
    await db.insert(rules).values([
      { profileId, subRule: "work", type: "MATCH", target: "🚀 节点选择", sort: 0 },
      { profileId, type: "SUB-RULE", payload: "(NETWORK,tcp)", target: "work", sort: -1 },
    ]);
    await renameGroup(db, profileId, "🚀 节点选择", "Proxy");
    await renameSubRule(db, profileId, "work", "office");

    const groups = await db.select().from(proxyGroups).where(eq(proxyGroups.profileId, profileId));
    expect(groups.find((g) => g.name === "🐟 漏网之鱼")?.members.items).toContain("Proxy");
    const ruleRows = await db.select().from(rules).where(eq(rules.profileId, profileId));
    expect(ruleRows.some((r) => r.target === "🚀 节点选择")).toBe(false);
    expect(ruleRows.find((r) => r.type === "SUB-RULE")?.target).toBe("office");
    expect(ruleRows.find((r) => r.subRule)?.subRule).toBe("office");

    const listenerRows = await db.select().from(listeners);
    expect(listenerRows.find((l) => l.name === "own")?.proxy).toBe("Proxy");
    expect(listenerRows.find((l) => l.id === shared.id)?.proxy).toBe("🚀 节点选择");
    expect(listenerRows.find((l) => l.id === sharedSub.id)?.subRule).toBe("work");
    expect(listenerRows.find((l) => l.name === "shared 副本")?.proxy).toBe("Proxy");
    expect(listenerRows.find((l) => l.name === "shared-sub 副本")?.subRule).toBe("office");

    const mainResources = await loadProfileResources(db, profileId);
    const otherResources = await loadProfileResources(db, other.id);
    expect(mainResources.listenerIds).not.toContain(shared.id);
    expect(mainResources.listenerIds).not.toContain(sharedSub.id);
    expect(mainResources.listenerIds).toHaveLength(3);
    expect(otherResources.listenerIds).toEqual([shared.id, sharedSub.id]);

    const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId));
    const { result } = await generateForProfile(db, profile);
    expect(result.errors).toEqual([]);
    expect(parse(result.yaml).listeners.map((l: { name: string }) => l.name)).toEqual(["own", "shared 副本", "shared-sub 副本"]);
  });

  it("cascades manual node renames and rejects ambiguous names", async () => {
    const [manual] = await db
      .insert(nodes)
      .values({
        name: "Manual Old",
        type: "ss",
        config: { name: "Manual Old", type: "ss", server: "192.0.2.1", port: 8388 },
      })
      .returning();
    await db.insert(profileManualNodes).values({ profileId, nodeId: manual.id, sort: 0 });
    const [group] = await db.select().from(proxyGroups).where(eq(proxyGroups.profileId, profileId));
    await db
      .update(proxyGroups)
      .set({ members: { ...group.members, items: [...group.members.items, "Manual Old"] } })
      .where(eq(proxyGroups.id, group.id));
    await db.insert(rules).values({ profileId, type: "DOMAIN", payload: "manual.example", target: "Manual Old", sort: -1 });
    const [listener] = await db.insert(listeners).values({ name: "manual", type: "mixed", port: 7896, proxy: "Manual Old" }).returning();

    const renamed = { name: "Manual New", type: "ss", server: "192.0.2.1", port: 8388 };
    await updateManualNodeConfig(db, manual.id, renamed, stringify(renamed));
    const [updatedGroup] = await db.select().from(proxyGroups).where(eq(proxyGroups.id, group.id));
    expect(updatedGroup.members.items).toContain("Manual New");
    expect((await db.select().from(rules)).some((r) => r.target === "Manual New")).toBe(true);
    expect((await db.select().from(listeners).where(eq(listeners.id, listener.id)))[0].proxy).toBe("Manual New");
    const conflicting = { name: "DIRECT", type: "ss" };
    await expect(updateManualNodeConfig(db, manual.id, conflicting, stringify(conflicting))).rejects.toThrow("冲突");
  });

  it("round-trips string pointers and YAML source, rebuilds references, and keeps sequences usable", async () => {
    const [passwordPointer, otherPasswordPointer] = await db
      .insert(pointers)
      .values([
        { name: "backupPassword", value: "192.0.2.10" },
        { name: "backupOtherPassword", value: "udp-password" },
      ])
      .returning();
    const profileYaml =
      "# backup comment\npassword: *backupPassword\nnested:\n  password: *backupOtherPassword\nunknown:\n  password: *notDefined\n";
    const nodeYaml = "# node comment\npassword: *backupPassword\n";
    await db.update(profiles).set({ baseConfig: profileYaml }).where(eq(profiles.id, profileId));
    const [manual] = await db.select().from(nodes).where(eq(nodes.name, "Manual New"));
    await db.update(nodes).set({ yaml: nodeYaml }).where(eq(nodes.id, manual.id));
    await syncPointerReferences(db, "profile", profileId, profileYaml);
    await syncPointerReferences(db, "node", manual.id, nodeYaml);

    const backup = JSON.parse(JSON.stringify(await exportAll(db)));
    expect(backup.version).toBe(3);
    expect(backup.data.pointers).toHaveLength(2);
    expect(backup.data).not.toHaveProperty("pointerReferences");
    await db.delete(pointerReferences);
    await importAll(db, backup);

    const again = await exportAll(db);
    expect(again.data.rules.length).toBe(backup.data.rules.length);
    expect(again.data.rules).toContainEqual(expect.objectContaining({ type: "DIVIDER", payload: "备用线路", target: "" }));
    expect(again.data.profileListeners.length).toBe(backup.data.profileListeners.length);
    expect(again.data.pointers).toHaveLength(2);
    expect(await db.select().from(pointers)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "backupPassword", value: "192.0.2.10" }),
        expect.objectContaining({ name: "backupOtherPassword", value: "udp-password" }),
      ]),
    );
    const [restoredProfile] = await db.select().from(profiles).where(eq(profiles.id, profileId));
    const [restoredNode] = await db.select().from(nodes).where(eq(nodes.id, manual.id));
    expect(restoredProfile.baseConfig).toBe(profileYaml);
    expect(restoredNode.yaml).toBe(nodeYaml);
    const references = await db.select().from(pointerReferences);
    expect(references).toHaveLength(3);
    expect(references).toEqual(
      expect.arrayContaining([
        { pointerId: passwordPointer.id, resourceType: "profile", resourceId: profileId },
        { pointerId: otherPasswordPointer.id, resourceType: "profile", resourceId: profileId },
        { pointerId: passwordPointer.id, resourceType: "node", resourceId: manual.id },
      ]),
    );
    const [inserted] = await db.insert(subscriptions).values({ name: "New", url: "https://x.com" }).returning();
    expect(inserted.id).toBeGreaterThan(1);
  });

  it("imports legacy JSONB selections into association tables", async () => {
    const current = JSON.parse(JSON.stringify(await exportAll(db)));
    const legacy = current;
    legacy.version = 1;
    legacy.data.profiles = current.data.profiles.map((profile: { id: number }) => ({
      ...profile,
      subscriptionIds: current.data.profileSubscriptions
        .filter((row: { profileId: number }) => row.profileId === profile.id)
        .sort((a: { sort: number }, b: { sort: number }) => a.sort - b.sort)
        .map((row: { subscriptionId: number }) => row.subscriptionId),
      manualNodeIds: current.data.profileManualNodes
        .filter((row: { profileId: number }) => row.profileId === profile.id)
        .sort((a: { sort: number }, b: { sort: number }) => a.sort - b.sort)
        .map((row: { nodeId: number }) => row.nodeId),
      listenerIds: current.data.profileListeners
        .filter((row: { profileId: number }) => row.profileId === profile.id)
        .sort((a: { sort: number }, b: { sort: number }) => a.sort - b.sort)
        .map((row: { listenerId: number }) => row.listenerId),
    }));
    delete legacy.data.profileSubscriptions;
    delete legacy.data.profileManualNodes;
    delete legacy.data.profileListeners;
    delete legacy.data.pointers;
    const expectedRefreshInterval = legacy.data.subscriptions[0].refreshInterval;
    for (const subscription of legacy.data.subscriptions) {
      subscription.cacheTtl = subscription.refreshInterval;
      delete subscription.refreshInterval;
    }

    await importAll(db, legacy);
    const [restored] = await db.select().from(profiles).orderBy(asc(profiles.sort), asc(profiles.id));
    const resources = await loadProfileResources(db, restored.id);
    expect(resources.subscriptionIds).toEqual([1]);
    expect(resources.manualNodeIds).toHaveLength(1);
    expect(resources.listenerIds).toHaveLength(3);
    expect((await db.select().from(subscriptions))[0].refreshInterval).toBe(expectedRefreshInterval);
  });

  it("imports v2 backups without pointers", async () => {
    const legacy = JSON.parse(JSON.stringify(await exportAll(db)));
    legacy.version = 2;
    delete legacy.data.pointers;

    await importAll(db, legacy);
    const restored = await exportAll(db);
    expect(restored.version).toBe(3);
    expect(restored.data.pointers).toEqual([]);
    expect(restored.data.profiles).toHaveLength(legacy.data.profiles.length);
    expect(await db.select().from(pointerReferences)).toEqual([]);
  });
});
