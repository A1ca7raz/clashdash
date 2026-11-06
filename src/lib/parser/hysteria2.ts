import type { MihomoProxy } from "@/lib/types";
import { compact, ParseError, splitList, splitUri, toPort, truthy } from "./util";

/** hysteria2://auth@host:port[,range]?sni=&insecure=1&obfs=salamander&obfs-password=&mport=#name (also hy2://) */
export function parseHysteria2(uri: string): MihomoProxy {
  const u = splitUri(uri);
  const p = u.params;
  if (!u.host) throw new ParseError("hysteria2 链接缺少服务器");

  // A port list/range in the authority ("443,5000-6000") maps to `ports`; the first value is `port`.
  const portField = u.port || "443";
  const firstPort = portField.split(/[,-]/)[0];
  const hopping = p.get("mport") || (portField !== firstPort ? portField : undefined);

  return compact({
    name: u.name || `${u.host}:${firstPort}`,
    type: "hysteria2",
    server: u.host,
    port: toPort(firstPort),
    ports: hopping,
    password: u.userinfo || p.get("auth") || undefined,
    sni: p.get("sni") || p.get("peer") || undefined,
    "skip-cert-verify": truthy(p.get("insecure")) || truthy(p.get("allowInsecure")) || undefined,
    obfs: p.get("obfs") && p.get("obfs") !== "none" ? p.get("obfs") : undefined,
    "obfs-password": p.get("obfs-password") || undefined,
    fingerprint: p.get("pinSHA256") || undefined,
    alpn: splitList(p.get("alpn")),
    up: p.get("upmbps") || p.get("up") || undefined,
    down: p.get("downmbps") || p.get("down") || undefined,
  });
}
