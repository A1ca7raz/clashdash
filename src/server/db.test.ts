import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { createDb, type Db } from "@/db/client";
import { listeners, nodes, profiles, proxyGroups, rules, subscriptions } from "@/db/schema";
import { DEFAULT_BASE_CONFIG } from "@/lib/base-config";
import { exportAll, importAll } from "./backup";
import { applyPreset } from "./presets";
import { generateForProfile, renameGroup, renameSubRule } from "./profile-data";

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
  const [p] = await db
    .insert(profiles)
    .values({ name: "Main", token: "t", baseConfig: DEFAULT_BASE_CONFIG, subscriptionIds: [sub.id] })
    .returning();
  profileId = p.id;
  await applyPreset(db, profileId);
}, 60_000);

describe("database flow (PGlite)", () => {
  it("generates a valid config from the preset", async () => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId));
    const { result } = await generateForProfile(db, profile);
    expect(result.errors).toEqual([]);
    const cfg = parse(result.yaml);
    expect(cfg.proxies.map((p: { name: string }) => p.name)).toEqual(["🇭🇰 香港 01", "🇯🇵 日本 01"]);
    expect(Object.keys(cfg["rule-providers"])).toContain("geosite-cn");
    expect(cfg.rules.at(-1)).toBe("MATCH,🐟 漏网之鱼");
  });

  it("cascades group and sub-rule renames", async () => {
    const [own, shared] = await db
      .insert(listeners)
      .values([
        { name: "own", type: "mixed", port: 7899, proxy: "🚀 节点选择" },
        { name: "shared", type: "mixed", port: 7898, proxy: "🚀 节点选择" },
      ])
      .returning();
    await db.update(profiles).set({ listenerIds: [own.id, shared.id] }).where(eq(profiles.id, profileId));
    await db.insert(profiles).values({ name: "Other", token: "t2", listenerIds: [shared.id] });
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
    expect(listenerRows.find((l) => l.name === "shared")?.proxy).toBe("🚀 节点选择");

    const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId));
    const { result } = await generateForProfile(db, profile);
    expect(result.errors).toEqual(["监听器「shared」的代理不存在：🚀 节点选择"]);
    expect(parse(result.yaml).listeners.map((l: { name: string }) => l.name)).toEqual(["own", "shared"]);
  });

  it("round-trips a backup and keeps sequences usable", async () => {
    const backup = JSON.parse(JSON.stringify(await exportAll(db)));
    await importAll(db, backup);
    const again = await exportAll(db);
    expect(again.data.rules.length).toBe(backup.data.rules.length);
    expect(again.data.nodes.length).toBe(2);
    const [inserted] = await db.insert(subscriptions).values({ name: "New", url: "https://x.com" }).returning();
    expect(inserted.id).toBeGreaterThan(1);
  });
});
