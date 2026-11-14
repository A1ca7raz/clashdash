import { isMap, parseDocument, type Document } from "yaml";
import { expandYamlPointers, type YamlPointerDefinition } from "@/lib/yaml-pointer";

/** Top-level keys the platform generates; writing them in base_config would define them twice. */
export const MANAGED_KEYS = [
  "proxies",
  "proxy-providers",
  "proxy-groups",
  "rule-providers",
  "rules",
  "sub-rules",
  "listeners",
] as const;

const PORT_KEYS = ["port", "socks-port", "mixed-port", "redir-port", "tproxy-port"] as const;

export interface DeclaredPort {
  port: number;
  source: string;
}

export interface BaseConfigCheck {
  doc: Document | null;
  errors: string[];
  ports: DeclaredPort[];
}

function portOf(address: unknown): number | null {
  if (typeof address !== "string") return null;
  const m = /:(\d+)$/.exec(address.trim());
  return m ? Number(m[1]) : null;
}

export function checkBaseConfig(text: string, pointers: YamlPointerDefinition[] = []): BaseConfigCheck {
  const doc = parseDocument(text || "{}", { keepSourceTokens: false });
  const errors = doc.errors.map((e) => `基础配置 YAML 语法错误：${e.message}`);
  if (errors.length) return { doc: null, errors, ports: [] };
  if (doc.contents !== null && !isMap(doc.contents)) {
    return { doc: null, errors: ["基础配置必须是 YAML 映射（key: value）"], ports: [] };
  }
  expandYamlPointers(doc, pointers);

  for (const key of MANAGED_KEYS) {
    if (doc.has(key)) errors.push(`基础配置中不能包含 \`${key}\`，它由平台生成`);
  }

  const ports: DeclaredPort[] = [];
  for (const key of PORT_KEYS) {
    const v = doc.get(key);
    if (typeof v === "number" && v > 0) ports.push({ port: v, source: key });
  }
  const controller = portOf(doc.get("external-controller"));
  if (controller) ports.push({ port: controller, source: "external-controller" });
  const dnsListen = portOf(doc.getIn(["dns", "listen"]));
  if (dnsListen) ports.push({ port: dnsListen, source: "dns.listen" });

  return { doc, errors, ports };
}

export const DEFAULT_BASE_CONFIG = `# 基础配置：端口、DNS、TUN 等。代理、代理组、规则、监听器由平台生成，不要写在这里。
mixed-port: 7890
allow-lan: false
mode: rule
log-level: info
ipv6: false
unified-delay: true
tcp-concurrent: true
external-controller: 127.0.0.1:9090

dns:
  enable: true
  ipv6: false
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  nameserver:
    - https://doh.pub/dns-query
    - https://dns.alidns.com/dns-query
`;
