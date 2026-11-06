import { parse as parseYaml } from "yaml";
import type { MihomoProxy } from "@/lib/types";
import { parseAnytls } from "./anytls";
import { parseHysteria2 } from "./hysteria2";
import { parseSs } from "./ss";
import { parseSsr } from "./ssr";
import { parseTrojan } from "./trojan";
import { parseTuic } from "./tuic";
import { parseVless } from "./vless";
import { parseVmess } from "./vmess";
import { parseWireguard } from "./wireguard";
import { decodeBase64, looksLikeBase64, ParseError } from "./util";

export { ParseError };

const URI_PARSERS: Record<string, (uri: string) => MihomoProxy> = {
  ss: parseSs,
  ssr: parseSsr,
  vmess: parseVmess,
  vless: parseVless,
  trojan: parseTrojan,
  hysteria2: parseHysteria2,
  hy2: parseHysteria2,
  tuic: parseTuic,
  wireguard: parseWireguard,
  wg: parseWireguard,
  anytls: parseAnytls,
};

export interface ParseResult {
  nodes: MihomoProxy[];
  /** One entry per line/item that couldn't be parsed. */
  errors: string[];
  format: "clash" | "uri" | "base64" | "unknown";
}

export function parseUri(line: string): MihomoProxy {
  const scheme = /^([a-z0-9]+):\/\//i.exec(line)?.[1]?.toLowerCase();
  const parser = scheme ? URI_PARSERS[scheme] : undefined;
  if (!parser) throw new ParseError(`不支持的协议：${scheme ?? line.slice(0, 20)}`);
  return parser(line);
}

function parseUriList(text: string): Omit<ParseResult, "format"> {
  const nodes: MihomoProxy[] = [];
  const errors: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    try {
      nodes.push(parseUri(line));
    } catch (err) {
      errors.push(`${line.slice(0, 40)}…：${(err as Error).message}`);
    }
  }
  return { nodes, errors };
}

function parseClashYaml(doc: unknown): Omit<ParseResult, "format"> | null {
  if (!doc || typeof doc !== "object" || !Array.isArray((doc as { proxies?: unknown }).proxies)) return null;
  const nodes: MihomoProxy[] = [];
  const errors: string[] = [];
  for (const item of (doc as { proxies: unknown[] }).proxies) {
    const p = item as Partial<MihomoProxy> | null;
    if (p && typeof p === "object" && typeof p.name === "string" && typeof p.type === "string") {
      nodes.push({ ...p, name: p.name, type: p.type });
    } else {
      errors.push(`无效节点：${JSON.stringify(item)?.slice(0, 60)}`);
    }
  }
  return { nodes, errors };
}

/** Auto-detects Clash/mihomo YAML, a plain URI list, or a base64-encoded URI list. */
export function parseSubscription(text: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { nodes: [], errors: [], format: "unknown" };

  if (!trimmed.includes("://")) {
    try {
      const clash = parseClashYaml(parseYaml(trimmed));
      if (clash) return { ...clash, format: "clash" };
    } catch {
      // not YAML; fall through
    }
    if (looksLikeBase64(trimmed)) {
      const decoded = decodeBase64(trimmed);
      if (decoded.includes("://")) return { ...parseUriList(decoded), format: "base64" };
    }
    return { nodes: [], errors: ["无法识别的订阅格式"], format: "unknown" };
  }

  try {
    const clash = parseClashYaml(parseYaml(trimmed));
    if (clash) return { ...clash, format: "clash" };
  } catch {
    // URI lists aren't valid YAML in general
  }
  return { ...parseUriList(trimmed), format: "uri" };
}
