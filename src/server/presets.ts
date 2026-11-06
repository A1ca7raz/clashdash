import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { proxyGroups, ruleProviders, rules } from "@/db/schema";
import type { GroupMembers } from "@/lib/types";

const META = "https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo";

const PROVIDERS = [
  { name: "geosite-private", behavior: "domain", url: `${META}/geosite/private.mrs` },
  { name: "geosite-ads", behavior: "domain", url: `${META}/geosite/category-ads-all.mrs` },
  { name: "geosite-!cn", behavior: "domain", url: `${META}/geosite/geolocation-!cn.mrs` },
  { name: "geosite-cn", behavior: "domain", url: `${META}/geosite/cn.mrs` },
  { name: "geoip-private", behavior: "ipcidr", url: `${META}/geoip/private.mrs` },
  { name: "geoip-cn", behavior: "ipcidr", url: `${META}/geoip/cn.mrs` },
];

const ALL: GroupMembers["sources"] = { all: true, subscriptions: [], manual: true };
const NONE: GroupMembers["sources"] = { all: false, subscriptions: [], manual: false };

const GROUPS: { name: string; type: "select" | "url-test"; members: GroupMembers }[] = [
  { name: "🚀 节点选择", type: "select", members: { items: ["♻️ 自动选择", "DIRECT"], sources: ALL } },
  { name: "♻️ 自动选择", type: "url-test", members: { items: [], sources: ALL } },
  { name: "🐟 漏网之鱼", type: "select", members: { items: ["🚀 节点选择", "DIRECT"], sources: NONE } },
];

const RULES: { type: string; payload: string; target: string; noResolve?: boolean }[] = [
  { type: "RULE-SET", payload: "geosite-private", target: "DIRECT" },
  { type: "RULE-SET", payload: "geosite-ads", target: "REJECT" },
  { type: "RULE-SET", payload: "geosite-!cn", target: "🚀 节点选择" },
  { type: "RULE-SET", payload: "geosite-cn", target: "DIRECT" },
  { type: "RULE-SET", payload: "geoip-private", target: "DIRECT", noResolve: true },
  { type: "RULE-SET", payload: "geoip-cn", target: "DIRECT", noResolve: true },
  { type: "MATCH", payload: "", target: "🐟 漏网之鱼" },
];

export const PRESET_NAME = "基础分流（MetaCubeX meta-rules-dat）";

/** Seeds an empty profile with groups, rules and the rule sets they need (existing rule sets are reused). */
export async function applyPreset(db: Db, profileId: number) {
  await db.transaction(async (tx) => {
    const existing = new Set((await tx.select({ name: ruleProviders.name }).from(ruleProviders)).map((r) => r.name));
    const missing = PROVIDERS.filter((p) => !existing.has(p.name));
    if (missing.length) {
      await tx.insert(ruleProviders).values(missing.map((p) => ({ ...p, format: "mrs", interval: 86400 })));
    }
    await tx.delete(proxyGroups).where(eq(proxyGroups.profileId, profileId));
    await tx.delete(rules).where(eq(rules.profileId, profileId));
    await tx.insert(proxyGroups).values(GROUPS.map((g, i) => ({ ...g, profileId, sort: i })));
    await tx.insert(rules).values(RULES.map((r, i) => ({ ...r, profileId, sort: i, noResolve: r.noResolve ?? false })));
  });
}
