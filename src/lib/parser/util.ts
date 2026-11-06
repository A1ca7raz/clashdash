export class ParseError extends Error {}

export function decodeBase64(input: string): string {
  const normalized = input.trim().replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

export function looksLikeBase64(input: string): boolean {
  const s = input.trim().replace(/\s+/g, "");
  return s.length > 0 && /^[A-Za-z0-9+/_-]+=*$/.test(s);
}

export function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export interface ParsedUri {
  scheme: string;
  userinfo: string;
  host: string;
  /** Kept as a string: hysteria2 allows port ranges such as "443,5000-6000". */
  port: string;
  path: string;
  params: URLSearchParams;
  name: string;
}

/** Tolerant URI split; WHATWG URL rejects port ranges and some odd userinfo encodings. */
export function splitUri(uri: string): ParsedUri {
  const m = /^([a-z0-9+.-]+):\/\/(.*)$/i.exec(uri.trim());
  if (!m) throw new ParseError("不是有效的链接");
  const scheme = m[1].toLowerCase();
  let rest = m[2];

  let name = "";
  const hashIdx = rest.indexOf("#");
  if (hashIdx >= 0) {
    name = safeDecode(rest.slice(hashIdx + 1));
    rest = rest.slice(0, hashIdx);
  }

  let query = "";
  const qIdx = rest.indexOf("?");
  if (qIdx >= 0) {
    query = rest.slice(qIdx + 1);
    rest = rest.slice(0, qIdx);
  }

  let path = "";
  const atIdx = rest.lastIndexOf("@");
  const slashIdx = rest.indexOf("/", atIdx + 1);
  if (slashIdx >= 0) {
    path = rest.slice(slashIdx);
    rest = rest.slice(0, slashIdx);
  }

  let userinfo = "";
  let hostport = rest;
  if (atIdx >= 0) {
    userinfo = safeDecode(rest.slice(0, atIdx));
    hostport = rest.slice(atIdx + 1);
  }

  let host: string;
  let port = "";
  if (hostport.startsWith("[")) {
    const end = hostport.indexOf("]");
    host = hostport.slice(1, end);
    port = hostport.slice(end + 2);
  } else {
    const colon = hostport.lastIndexOf(":");
    host = colon >= 0 ? hostport.slice(0, colon) : hostport;
    port = colon >= 0 ? hostport.slice(colon + 1) : "";
  }

  return { scheme, userinfo, host, port, path, params: new URLSearchParams(query), name };
}

export function toPort(port: string | number | undefined): number {
  const n = Number(port);
  if (!Number.isInteger(n) || n <= 0 || n > 65535) throw new ParseError(`端口无效：${port}`);
  return n;
}

export function truthy(v: string | null | undefined): boolean {
  return v === "1" || v === "true" || v === "True";
}

export function splitList(v: string | null | undefined): string[] | undefined {
  if (!v) return undefined;
  const list = v.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : undefined;
}

/** Drops undefined/empty values so emitted YAML stays minimal. */
export function compact<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "object" && !Array.isArray(v)) {
      const inner = compact(v as Record<string, unknown>);
      if (Object.keys(inner).length === 0) continue;
      out[k] = inner;
    } else if (Array.isArray(v) && v.length === 0) {
      continue;
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

interface TransportInput {
  network?: string | null;
  headerType?: string | null;
  host?: string | null;
  path?: string | null;
  serviceName?: string | null;
}

/** Shared ws/grpc/h2/http transport mapping used by vmess, vless and trojan. */
export function transportOptions({ network, headerType, host, path, serviceName }: TransportInput) {
  const net = (network || "tcp").toLowerCase();
  const hosts = splitList(host);
  switch (net) {
    case "ws":
    case "httpupgrade":
      return {
        network: "ws",
        "ws-opts": compact({
          path: path || "/",
          headers: hosts ? { Host: hosts[0] } : undefined,
          "v2ray-http-upgrade": net === "httpupgrade" ? true : undefined,
        }),
      };
    case "grpc":
      return { network: "grpc", "grpc-opts": compact({ "grpc-service-name": serviceName || path || "" }) };
    case "h2":
    case "http":
      if (net === "http" || headerType === "http") {
        return { network: "http", "http-opts": compact({ path: [path || "/"], headers: hosts ? { Host: hosts } : undefined }) };
      }
      return { network: "h2", "h2-opts": compact({ host: hosts, path: path || "/" }) };
    case "xhttp":
      return { network: "xhttp", "xhttp-opts": compact({ path: path || "/", host: hosts?.[0] }) };
    case "tcp":
      if (headerType === "http") {
        return { network: "http", "http-opts": compact({ path: [path || "/"], headers: hosts ? { Host: hosts } : undefined }) };
      }
      return {};
    default:
      return { network: net };
  }
}
