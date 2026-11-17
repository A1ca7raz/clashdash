import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 5;

function maxBytes(): number {
  const raw = process.env.SUBSCRIPTION_MAX_BYTES;
  if (!raw) return DEFAULT_MAX_BYTES;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_MAX_BYTES;
}

function allowPrivateNetwork(): boolean {
  return process.env.SUBSCRIPTION_ALLOW_PRIVATE_NETWORK === "1";
}

function isPrivateIPv4(parts: number[]): boolean {
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function parseIPv6(ip: string): number[] | null {
  const halves = ip.toLowerCase().split("::");
  if (halves.length > 2) return null;
  const parseHalf = (s: string) => (s === "" ? [] : s.split(":").map((h) => Number.parseInt(h, 16)));
  const head = parseHalf(halves[0]);
  const tail = halves.length === 2 ? parseHalf(halves[1]) : [];
  if (head.some(Number.isNaN) || tail.some(Number.isNaN)) return null;
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  return [...head, ...Array<number>(missing).fill(0), ...tail];
}

function isBlockedIPv6(ip: string): boolean {
  const hextets = parseIPv6(ip);
  if (!hextets) return false;
  const headIsZero = (n: number) => hextets.slice(0, n).every((h) => h === 0);
  const asIPv4 = [hextets[6] >> 8, hextets[6] & 0xff, hextets[7] >> 8, hextets[7] & 0xff];
  // IPv4-mapped ::ffff:a.b.c.d (URLs normalize the dotted form to hextets, e.g. ::ffff:7f00:1).
  if (headIsZero(5) && hextets[5] === 0xffff) return isPrivateIPv4(asIPv4);
  // ::, ::1 and deprecated IPv4-compatible ::a.b.c.d — the low 32 bits are all in 0.0.0.0/8 anyway.
  if (headIsZero(6)) return isPrivateIPv4(asIPv4);
  if ((hextets[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if (hextets[0] >= 0xfe80 && hextets[0] <= 0xfebf) return true; // fe80::/10 link-local
  return false;
}

function isBlockedAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateIPv4(ip.split(".").map(Number));
  if (kind !== 6) return false;
  return isBlockedIPv6(ip);
}

function privateAddressMessage(): string {
  return "订阅地址指向内网或保留地址，已阻止（如需允许请设置 SUBSCRIPTION_ALLOW_PRIVATE_NETWORK=1）";
}

/** Exported for tests. */
export async function assertUrlAllowed(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("订阅地址无效");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("订阅地址仅支持 http/https 协议");
  }
  if (allowPrivateNetwork()) return url;
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".internal")) {
    throw new Error(privateAddressMessage());
  }
  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) throw new Error(privateAddressMessage());
    return url;
  }
  // NOTE: the hostname is resolved here and again by fetch at connect time; a DNS rebinding
  // between the two lookups is a known residual risk (TOCTOU).
  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new Error("订阅域名解析失败");
  }
  if (addresses.some((a) => isBlockedAddress(a.address))) throw new Error(privateAddressMessage());
  return url;
}

async function readLimitedText(res: Response): Promise<string> {
  if (!res.body) return "";
  const limit = maxBytes();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) throw new Error(`订阅内容超过大小上限（${Math.round(limit / 1024 / 1024)}MB）`);
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/**
 * Fetches a subscription body with protocol/address validation (SSRF guard), manual redirect
 * handling (every hop is re-validated) and a response size cap.
 */
export async function fetchTextWithGuards(
  initialUrl: string,
  { headers, timeoutMs }: { headers?: Record<string, string>; timeoutMs: number },
): Promise<{ text: string; headers: Headers }> {
  const deadline = Date.now() + timeoutMs;
  let url = initialUrl;
  for (let redirects = 0; ; redirects++) {
    const checked = await assertUrlAllowed(url);
    const res = await fetch(checked, {
      headers,
      signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
      redirect: "manual",
      cache: "no-store",
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error(`HTTP ${res.status}`);
      if (redirects >= MAX_REDIRECTS) throw new Error("订阅重定向次数过多");
      url = new URL(location, checked).toString();
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { text: await readLimitedText(res), headers: res.headers };
  }
}
