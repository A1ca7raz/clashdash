import { isMap, YAMLMap, type Document, type YAMLSeq } from "yaml";
import type { Listener, Node, Profile, ProxyGroup, Rule, RuleProvider, Subscription } from "@/db/schema";
import { checkBaseConfig } from "@/lib/base-config";
import { applyProcessing, compileProcessing, matchGroupFilter } from "@/lib/processing";
import { splitFilter, toRegExp } from "@/lib/regex";
import { BUILTIN_POLICIES, NO_RESOLVE_RULE_TYPES, type MihomoProxy } from "@/lib/types";

export interface GenerateInput {
  profile: Pick<Profile, "name" | "baseConfig" | "subscriptionIds" | "manualNodeIds" | "listenerIds">;
  /** All subscriptions; the profile's selection and order come from `profile.subscriptionIds`. */
  subscriptions: Subscription[];
  /** Nodes of the selected subscriptions (inline nodes and provider snapshots) plus manual nodes. */
  nodes: Node[];
  groups: ProxyGroup[];
  ruleProviders: RuleProvider[];
  rules: Rule[];
  /** All listeners; the profile's selection and order come from `profile.listenerIds`. */
  listeners: Listener[];
}

export interface GenerateResult {
  yaml: string;
  errors: string[];
  warnings: string[];
  stats: { proxies: number; providers: number; groups: number; rules: number; listeners: number };
  /** Final names of inline and manual nodes written to `proxies` (valid rule/listener targets). */
  proxyNames: string[];
  /**
   * Final node names per source after subscription processing: inline nodes as written, provider
   * nodes from the latest snapshot. Keyed by subscription id, or "manual".
   */
  sourceNames: Record<string, string[]>;
}

const DEFAULT_TEST_URL = "https://www.gstatic.com/generate_204";
const BUILTINS = new Set<string>(BUILTIN_POLICIES);

const bySort = <T extends { sort: number; id: number }>(a: T, b: T) => a.sort - b.sort || a.id - b.id;

function uniqueName(base: string, taken: Set<string>): string {
  let name = base;
  for (let i = 2; taken.has(name); i++) name = `${base} ${i}`;
  taken.add(name);
  return name;
}

export function ruleLine(r: Pick<Rule, "type" | "payload" | "target" | "noResolve">): string {
  if (r.type === "MATCH") return `MATCH,${r.target}`;
  const parts = [r.type, r.payload, r.target];
  if (r.noResolve) parts.push("no-resolve");
  return parts.join(",");
}

export function generateConfig(input: GenerateInput): GenerateResult {
  try {
    return generate(input);
  } catch (err) {
    return {
      yaml: "",
      errors: [`生成失败：${(err as Error).message}`],
      warnings: [],
      stats: { proxies: 0, providers: 0, groups: 0, rules: 0, listeners: 0 },
      proxyNames: [],
      sourceNames: {},
    };
  }
}

function generate(input: GenerateInput): GenerateResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { profile } = input;

  // Base config
  const base = checkBaseConfig(profile.baseConfig);
  errors.push(...base.errors);
  const doc = base.doc;

  // Selected subscriptions, in profile order
  const subsById = new Map(input.subscriptions.map((s) => [s.id, s]));
  const selected: Subscription[] = [];
  for (const id of profile.subscriptionIds) {
    const s = subsById.get(id);
    if (s?.enabled) selected.push(s);
  }
  const nodesBySub = new Map<number | null, Node[]>();
  for (const n of [...input.nodes].sort(bySort)) {
    if (!n.enabled) continue;
    const list = nodesBySub.get(n.subscriptionId) ?? [];
    list.push(n);
    nodesBySub.set(n.subscriptionId, list);
  }

  // Inline nodes -> proxies; names made unique across sources
  const takenNames = new Set<string>();
  const proxies: MihomoProxy[] = [];
  const inlineNamesBySub = new Map<number, string[]>();
  const manualNames: string[] = [];
  for (const sub of selected) {
    if (sub.mode !== "inline") continue;
    const processed = applyProcessing(nodesBySub.get(sub.id) ?? [], sub.processing);
    if (processed.length === 0) warnings.push(`订阅「${sub.name}」没有可用节点`);
    const names: string[] = [];
    for (const p of processed) {
      const name = uniqueName(p.name, takenNames);
      proxies.push(orderedProxy(p.node.config, name));
      names.push(name);
    }
    inlineNamesBySub.set(sub.id, names);
  }
  const manualById = new Map((nodesBySub.get(null) ?? []).map((n) => [n.id, n]));
  for (const id of profile.manualNodeIds) {
    const n = manualById.get(id);
    if (!n) continue;
    const name = uniqueName(n.config.name || n.name, takenNames);
    proxies.push(orderedProxy(n.config, name));
    manualNames.push(name);
  }

  // Provider subscriptions -> proxy-providers
  const providers: Record<string, unknown> = {};
  const providerNameBySub = new Map<number, string>();
  const snapshotNamesBySub = new Map<number, string[]>();
  const providerNames = new Set<string>();
  for (const sub of selected) {
    if (sub.mode !== "provider") continue;
    const name = uniqueName(sub.name, providerNames);
    providerNameBySub.set(sub.id, name);
    const snapshot = nodesBySub.get(sub.id) ?? [];
    if (snapshot.length) {
      const processed = applyProcessing(snapshot, sub.processing).map((p) => p.name);
      snapshotNamesBySub.set(sub.id, processed);
      if (processed.length === 0) {
        warnings.push(`订阅「${sub.name}」按当前过滤条件匹配不到节点，客户端加载该 provider 会失败`);
      }
    }
    const hc = sub.providerOptions.healthCheck;
    providers[name] = {
      type: "http",
      url: sub.url,
      interval: sub.providerOptions.interval ?? 3600,
      path: `./providers/sub-${sub.id}.yaml`,
      header: { "User-Agent": [sub.userAgent] },
      ...(hc?.enable
        ? {
            "health-check": {
              enable: true,
              url: hc.url || DEFAULT_TEST_URL,
              interval: hc.interval ?? 300,
              ...(hc.lazy !== undefined ? { lazy: hc.lazy } : {}),
            },
          }
        : {}),
      ...compileProcessing(sub.processing),
    };
  }

  // Proxy groups
  const groups = [...input.groups].sort(bySort);
  const groupNames = new Set<string>();
  for (const g of groups) {
    if (groupNames.has(g.name)) errors.push(`代理组名称重复：${g.name}`);
    groupNames.add(g.name);
    if (takenNames.has(g.name)) errors.push(`代理组「${g.name}」与节点重名`);
    if (BUILTINS.has(g.name)) errors.push(`代理组不能使用内置策略名：${g.name}`);
  }
  const policyNames = new Set<string>([...groupNames, ...takenNames, ...BUILTINS]);

  const groupOut: Record<string, unknown>[] = [];
  for (const g of groups) {
    const m = g.members;
    const explicit: string[] = [];
    for (const item of m.items) {
      if (!policyNames.has(item)) errors.push(`代理组「${g.name}」引用了不存在的成员：${item}`);
      else if (item === g.name) errors.push(`代理组「${g.name}」不能包含自身`);
      else explicit.push(item);
    }

    const sourceSubs = m.sources.all
      ? selected
      : m.sources.subscriptions.map((id) => subsById.get(id)).filter((s): s is Subscription => !!s);
    const inlineCandidates: string[] = [];
    const use: string[] = [];
    let providerMatchKnown = true;
    let providerMatches = 0;
    for (const s of sourceSubs) {
      if (!selected.includes(s)) {
        warnings.push(`代理组「${g.name}」引用的订阅「${s.name}」未被当前配置方案选用或已停用，已忽略`);
        continue;
      }
      if (s.mode === "inline") {
        inlineCandidates.push(...(inlineNamesBySub.get(s.id) ?? []));
      } else {
        use.push(providerNameBySub.get(s.id)!);
        const snap = snapshotNamesBySub.get(s.id);
        if (snap) providerMatches += matchGroupFilter(snap, m.include, m.exclude).length;
        else providerMatchKnown = false;
      }
    }
    if (m.sources.manual) inlineCandidates.push(...manualNames);

    const expanded = matchGroupFilter(inlineCandidates, m.include, m.exclude).filter((n) => !explicit.includes(n));
    const groupProxies = [...explicit, ...expanded];

    if (groupProxies.length === 0 && use.length === 0) {
      errors.push(`代理组「${g.name}」没有任何成员`);
    } else if (groupProxies.length === 0 && providerMatchKnown && providerMatches === 0) {
      warnings.push(`代理组「${g.name}」按最近的节点快照匹配不到任何节点`);
    }
    if (use.length && m.exclude) {
      const res = splitFilter(m.exclude).map((f) => toRegExp(f));
      const hit = explicit.filter((n) => res.some((re) => re.test(n)));
      if (hit.length) {
        warnings.push(`代理组「${g.name}」的排除过滤在客户端也会排除显式成员：${hit.join("、")}`);
      }
    }

    const o = g.options;
    const needsTest = g.type === "url-test" || g.type === "fallback" || g.type === "load-balance";
    const out: Record<string, unknown> = { name: g.name, type: g.type };
    if (groupProxies.length) out.proxies = groupProxies;
    if (use.length) {
      out.use = use;
      if (m.include) out.filter = m.include;
      if (m.exclude) out["exclude-filter"] = m.exclude;
    }
    if (needsTest || o.url) out.url = o.url || DEFAULT_TEST_URL;
    if (needsTest || o.interval) out.interval = o.interval ?? 300;
    if (g.type === "url-test" && o.tolerance !== undefined) out.tolerance = o.tolerance;
    if (o.timeout !== undefined) out.timeout = o.timeout;
    if (o.lazy !== undefined) out.lazy = o.lazy;
    if (g.type === "load-balance" && o.strategy) out.strategy = o.strategy;
    if (o.disableUdp) out["disable-udp"] = true;
    if (o.hidden) out.hidden = true;
    if (o.icon) out.icon = o.icon;
    groupOut.push(out);
  }

  // Cycles between groups
  const edges = new Map(groups.map((g) => [g.name, g.members.items.filter((i) => groupNames.has(i))]));
  const state = new Map<string, "visiting" | "done">();
  const visit = (name: string, path: string[]): void => {
    if (state.get(name) === "done") return;
    if (state.get(name) === "visiting") {
      errors.push(`代理组存在循环引用：${[...path.slice(path.indexOf(name)), name].join(" → ")}`);
      return;
    }
    state.set(name, "visiting");
    for (const next of edges.get(name) ?? []) visit(next, [...path, name]);
    state.set(name, "done");
  };
  for (const g of groups) visit(g.name, []);

  // Rules and sub-rules
  const enabledRules = input.rules.filter((r) => r.enabled).sort(bySort);
  const subRuleNames = new Set(input.rules.map((r) => r.subRule).filter((s): s is string => !!s));
  const ruleProvidersByName = new Map(input.ruleProviders.map((p) => [p.name, p]));
  const usedProviders = new Set<string>();

  const checkRule = (r: Rule, where: string) => {
    const label = `${where}「${ruleLine(r)}」`;
    if (r.type === "SUB-RULE") {
      if (!subRuleNames.has(r.target)) errors.push(`${label}引用了不存在的子规则：${r.target}`);
      if (r.target === r.subRule) errors.push(`${label}不能引用自身所在的子规则`);
    } else if (!policyNames.has(r.target)) {
      errors.push(`${label}的目标不存在：${r.target}`);
    }
    if (r.type !== "MATCH" && !r.payload) errors.push(`${label}缺少内容`);
    if (r.noResolve && !NO_RESOLVE_RULE_TYPES.includes(r.type)) warnings.push(`${label}的 no-resolve 对该规则类型无效`);
    if (r.type === "RULE-SET") {
      if (!ruleProvidersByName.has(r.payload)) errors.push(`${label}引用了不存在的规则集：${r.payload}`);
      else usedProviders.add(r.payload);
    }
  };

  const mainRules = enabledRules.filter((r) => !r.subRule);
  mainRules.forEach((r) => checkRule(r, "规则"));
  if (mainRules.length === 0 || mainRules[mainRules.length - 1].type !== "MATCH") {
    errors.push("主规则的最后一条必须是 MATCH");
  }
  if (mainRules.slice(0, -1).some((r) => r.type === "MATCH")) {
    warnings.push("MATCH 之后的规则永远不会被匹配");
  }

  const subRulesOut: Record<string, string[]> = {};
  for (const name of [...subRuleNames].sort()) {
    const list = enabledRules.filter((r) => r.subRule === name);
    list.forEach((r) => checkRule(r, `子规则 ${name} 中的规则`));
    subRulesOut[name] = list.map(ruleLine);
  }

  const ruleProvidersOut: Record<string, unknown> = {};
  for (const p of input.ruleProviders) {
    if (!usedProviders.has(p.name)) continue;
    ruleProvidersOut[p.name] = { type: "http", behavior: p.behavior, format: p.format, url: p.url, interval: p.interval };
  }

  // Listeners
  const listenersOut: Record<string, unknown>[] = [];
  const listenerNames = new Set<string>();
  const usedPorts = new Map<number, string>(base.ports.map((p) => [p.port, `基础配置 ${p.source}`]));
  const listenersById = new Map(input.listeners.map((l) => [l.id, l]));
  const selectedListeners = profile.listenerIds.map((id) => listenersById.get(id)).filter((l): l is Listener => !!l?.enabled);
  for (const l of selectedListeners) {
    const label = `监听器「${l.name}」`;
    if (listenerNames.has(l.name)) errors.push(`监听器名称重复：${l.name}`);
    listenerNames.add(l.name);

    if (l.type !== "tun") {
      if (!l.port || l.port < 1 || l.port > 65535) {
        errors.push(`${label}端口无效`);
      } else if (usedPorts.has(l.port)) {
        errors.push(`${label}的端口 ${l.port} 与${usedPorts.get(l.port)}冲突`);
      } else {
        usedPorts.set(l.port, `监听器「${l.name}」`);
      }
    }
    if (l.proxy && l.subRule) errors.push(`${label}不能同时指定代理和子规则`);
    if (l.proxy && !policyNames.has(l.proxy)) errors.push(`${label}的代理不存在：${l.proxy}`);
    if (l.subRule && !subRuleNames.has(l.subRule)) errors.push(`${label}引用了不存在的子规则：${l.subRule}`);

    const out: Record<string, unknown> = { name: l.name, type: l.type };
    if (l.type !== "tun") {
      out.port = l.port;
      out.listen = l.listen || "0.0.0.0";
    }
    if (l.proxy) out.proxy = l.proxy;
    if (l.subRule) out.rule = l.subRule;
    for (const [k, v] of Object.entries(l.options ?? {})) {
      if (k in out || ["name", "type", "port", "listen", "proxy", "rule"].includes(k)) {
        warnings.push(`${label}的附加选项 ${k} 与基本字段重复，已忽略`);
      } else {
        out[k] = v;
      }
    }
    listenersOut.push(out);
  }

  // Assemble, keeping base config comments and key order
  let yaml = "";
  if (doc) {
    if (!isMap(doc.contents)) doc.contents = new YAMLMap();
    setFlowList(doc, "proxies", proxies);
    if (Object.keys(providers).length) doc.set("proxy-providers", providers);
    doc.set("proxy-groups", groupOut);
    if (Object.keys(ruleProvidersOut).length) doc.set("rule-providers", ruleProvidersOut);
    doc.set("rules", mainRules.map(ruleLine));
    if (Object.keys(subRulesOut).length) doc.set("sub-rules", subRulesOut);
    if (listenersOut.length) doc.set("listeners", listenersOut);
    yaml = doc.toString({ lineWidth: 0 });
  }

  return {
    yaml,
    errors,
    warnings,
    stats: {
      proxies: proxies.length,
      providers: Object.keys(providers).length,
      groups: groupOut.length,
      rules: mainRules.length,
      listeners: listenersOut.length,
    },
    proxyNames: proxies.map((p) => p.name),
    sourceNames: {
      ...Object.fromEntries(inlineNamesBySub),
      ...Object.fromEntries(snapshotNamesBySub),
      manual: manualNames,
    },
  };
}

function orderedProxy(config: MihomoProxy, name: string): MihomoProxy {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { name: _original, type, server, port, ...rest } = config;
  return { name, type, server, port, ...rest };
}

/** Proxies render one per line as flow maps, the usual compact Clash style. */
function setFlowList(doc: Document, key: string, items: object[]) {
  const node = doc.createNode(items) as YAMLSeq;
  for (const item of node.items) {
    if (isMap(item)) item.flow = true;
  }
  doc.set(key, node);
}
