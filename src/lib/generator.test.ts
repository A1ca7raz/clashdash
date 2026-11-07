import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { Listener, Node, ProxyGroup, Rule, RuleProvider, Subscription } from "@/db/schema";
import { generateConfig, type GenerateInput } from "./generator";

const now = new Date();
let seq = 1;

function sub(p: Partial<Subscription> & Pick<Subscription, "id" | "name">): Subscription {
  return {
    url: `https://example.com/${p.id}`,
    userAgent: "clash.meta",
    enabled: true,
    mode: "inline",
    processing: {},
    providerOptions: {},
    cacheTtl: 3600,
    lastAttemptAt: null,
    lastFetchedAt: null,
    lastError: null,
    userinfo: null,
    nodeCount: 0,
    sort: 0,
    createdAt: now,
    ...p,
  };
}

function node(subscriptionId: number | null, name: string): Node {
  const id = seq++;
  return { id, subscriptionId, name, type: "ss", config: { name, type: "ss", server: "s", port: 1 }, enabled: true, sort: id, createdAt: now };
}

function group(name: string, p: Partial<ProxyGroup> = {}): ProxyGroup {
  const id = seq++;
  return {
    id,
    profileId: 1,
    name,
    type: "select",
    options: {},
    members: { items: [], sources: { all: true, subscriptions: [], manual: true } },
    sort: id,
    ...p,
  };
}

function rule(type: string, payload: string, target: string, p: Partial<Rule> = {}): Rule {
  const id = seq++;
  return { id, profileId: 1, subRule: null, type, payload, target, noResolve: false, enabled: true, remark: null, sort: id, ...p };
}

function listener(name: string, p: Partial<Listener> = {}): Listener {
  const id = seq++;
  return { id, name, type: "mixed", listen: "0.0.0.0", port: 10000 + id, proxy: null, subRule: null, options: {}, enabled: true, sort: id, ...p };
}

function input(p: Partial<GenerateInput> = {}): GenerateInput {
  const nodes = p.nodes ?? [node(1, "HK 1"), node(1, "JP 1"), node(2, "HK 9"), node(null, "Manual")];
  const manualNodeIds = nodes.filter((n) => n.subscriptionId === null).map((n) => n.id);
  const listenerIds = (p.listeners ?? []).map((l) => l.id);
  return {
    profile: { name: "p", baseConfig: "# keep me\nmixed-port: 7890\n", subscriptionIds: [1, 2], manualNodeIds, listenerIds },
    subscriptions: [
      sub({ id: 1, name: "Inline", processing: { prefix: "I-" } }),
      sub({ id: 2, name: "Prov", mode: "provider", processing: { include: "HK", flag: true }, providerOptions: { healthCheck: { enable: true } } }),
    ],
    nodes,
    groups: [group("Proxy", { members: { items: ["Auto", "DIRECT"], sources: { all: true, subscriptions: [], manual: true } } }), group("Auto", { type: "url-test" })],
    ruleProviders: [] as RuleProvider[],
    rules: [rule("DOMAIN-SUFFIX", "google.com", "Proxy"), rule("MATCH", "", "DIRECT")],
    listeners: [],
    ...p,
  };
}

describe("generateConfig", () => {
  it("builds a complete config and keeps base config comments", () => {
    const r = generateConfig(input());
    expect(r.errors).toEqual([]);
    expect(r.yaml.startsWith("# keep me")).toBe(true);
    const cfg = parse(r.yaml);
    expect(cfg["mixed-port"]).toBe(7890);
    expect(cfg.proxies.map((p: { name: string }) => p.name)).toEqual(["I-HK 1", "I-JP 1", "Manual"]);
    expect(cfg["proxy-providers"].Prov).toMatchObject({
      type: "http",
      url: "https://example.com/2",
      filter: "HK",
      header: { "User-Agent": ["clash.meta"] },
      "health-check": { enable: true },
    });
    expect(cfg["proxy-providers"].Prov.override["proxy-name"].length).toBeGreaterThan(0);
    expect(cfg["proxy-groups"][0]).toEqual({ name: "Proxy", type: "select", proxies: ["Auto", "DIRECT", "I-HK 1", "I-JP 1", "Manual"], use: ["Prov"] });
    expect(cfg["proxy-groups"][1]).toMatchObject({ name: "Auto", type: "url-test", url: expect.any(String), interval: 300 });
    expect(cfg.rules).toEqual(["DOMAIN-SUFFIX,google.com,Proxy", "MATCH,DIRECT"]);
  });

  it("renders proxies as one flow map per line", () => {
    expect(generateConfig(input()).yaml).toMatch(/^ {2}- \{ name: I-HK 1, type: ss/m);
  });

  it("includes only the manual nodes added to the profile, in profile order", () => {
    const [a, b, c] = [node(null, "M-A"), node(null, "M-B"), node(null, "M-C")];
    const r = generateConfig({
      ...input({ nodes: [a, b, c] }),
      profile: { name: "p", baseConfig: "", subscriptionIds: [], manualNodeIds: [c.id, a.id], listenerIds: [] },
    });
    expect(parse(r.yaml).proxies.map((p: { name: string }) => p.name)).toEqual(["M-C", "M-A"]);
  });

  it("includes only the listeners added to the profile, in profile order", () => {
    const [a, b, c] = [listener("a"), listener("b"), listener("c")];
    const base = input({ listeners: [a, b, c] });
    const r = generateConfig({ ...base, profile: { ...base.profile, listenerIds: [c.id, a.id] } });
    expect(r.errors).toEqual([]);
    expect(parse(r.yaml).listeners.map((l: { name: string }) => l.name)).toEqual(["c", "a"]);
  });

  it("suffixes node names that collide across sources", () => {
    const r = generateConfig(input({ nodes: [node(1, "A"), node(null, "I-A")] }));
    expect(parse(r.yaml).proxies.map((p: { name: string }) => p.name)).toEqual(["I-A", "I-A 2"]);
  });

  it("emits group filters only alongside providers", () => {
    const g = group("HK", { members: { items: [], sources: { all: true, subscriptions: [], manual: false }, include: "HK" } });
    const cfg = parse(generateConfig(input({ groups: [g] , rules: [rule("MATCH", "", "HK")] })).yaml);
    expect(cfg["proxy-groups"][0]).toEqual({ name: "HK", type: "select", proxies: ["I-HK 1"], use: ["Prov"], filter: "HK" });
  });

  it("validates references, cycles, MATCH and base config keys", () => {
    const r = generateConfig(
      input({
        profile: { name: "p", baseConfig: "rules: []\n", subscriptionIds: [1], manualNodeIds: [], listenerIds: [] },
        groups: [
          group("A", { members: { items: ["B"], sources: { all: false, subscriptions: [], manual: false } } }),
          group("B", { members: { items: ["A", "Missing"], sources: { all: false, subscriptions: [], manual: false } } }),
        ],
        rules: [rule("RULE-SET", "nope", "A"), rule("DOMAIN", "x.com", "Nowhere")],
      }),
    );
    const text = r.errors.join("\n");
    expect(text).toContain("`rules`");
    expect(text).toContain("Missing");
    expect(text).toContain("循环引用");
    expect(text).toContain("nope");
    expect(text).toContain("Nowhere");
    expect(text).toContain("MATCH");
  });

  it("emits sub-rules and listeners and checks their references and ports", () => {
    const ok = generateConfig(
      input({
        rules: [
          rule("SUB-RULE", "(NETWORK,tcp)", "work"),
          rule("MATCH", "", "DIRECT"),
          rule("DOMAIN-SUFFIX", "corp.com", "Proxy", { subRule: "work" }),
          rule("MATCH", "", "DIRECT", { subRule: "work" }),
        ],
        listeners: [listener("hk", { port: 7891, proxy: "Proxy" }), listener("w", { port: 7892, subRule: "work", options: { udp: false } })],
      }),
    );
    expect(ok.errors).toEqual([]);
    const cfg = parse(ok.yaml);
    expect(cfg["sub-rules"]).toEqual({ work: ["DOMAIN-SUFFIX,corp.com,Proxy", "MATCH,DIRECT"] });
    expect(cfg.listeners).toEqual([
      { name: "hk", type: "mixed", port: 7891, listen: "0.0.0.0", proxy: "Proxy" },
      { name: "w", type: "mixed", port: 7892, listen: "0.0.0.0", rule: "work", udp: false },
    ]);

    const bad = generateConfig(
      input({
        listeners: [
          listener("a", { port: 7890 }),
          listener("b", { port: 7900, proxy: "HK 9" }),
          listener("c", { port: 7901, subRule: "missing" }),
        ],
      }),
    );
    const text = bad.errors.join("\n");
    expect(text).toContain("mixed-port");
    expect(text).toContain("HK 9");
    expect(text).toContain("missing");
  });

  it("emits inline rule providers and preserves HTTP options", () => {
    const r = generateConfig(
      input({
        ruleProviders: [
          {
            id: 1,
            name: "local",
            type: "inline",
            behavior: "domain",
            format: "mrs",
            url: null,
            interval: 86400,
            payload: ["DOMAIN-SUFFIX,example.com"],
            options: {},
            createdAt: now,
          },
          {
            id: 2,
            name: "remote",
            type: "http",
            behavior: "domain",
            format: "yaml",
            url: "https://example.com/rules.yaml",
            interval: 600,
            payload: [],
            options: { path: "./rules/remote.yaml" },
            createdAt: now,
          },
        ],
        rules: [
          rule("RULE-SET", "local", "Proxy"),
          rule("RULE-SET", "remote", "Proxy"),
          rule("MATCH", "", "DIRECT"),
        ],
      }),
    );
    expect(r.errors).toEqual([]);
    expect(parse(r.yaml)["rule-providers"]).toEqual({
      local: { type: "inline", behavior: "domain", payload: ["DOMAIN-SUFFIX,example.com"] },
      remote: {
        type: "http",
        behavior: "domain",
        format: "yaml",
        url: "https://example.com/rules.yaml",
        interval: 600,
        path: "./rules/remote.yaml",
      },
    });
  });

  it("warns when a provider's filter matches nothing in the snapshot", () => {
    const r = generateConfig(input({ nodes: [node(1, "HK 1"), node(2, "JP 9")] }));
    expect(r.warnings.join("\n")).toContain("Prov");
  });
});
