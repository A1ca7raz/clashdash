import type { MihomoProxy } from "@/lib/types";
import { compact, ParseError, splitList, splitUri, toPort, transportOptions, truthy } from "./util";

export function parseVless(uri: string): MihomoProxy {
  const u = splitUri(uri);
  if (!u.userinfo) throw new ParseError("vless 链接缺少 UUID");
  const p = u.params;
  const security = p.get("security") ?? "";
  const tls = security === "tls" || security === "reality" || security === "xtls";

  return compact({
    name: u.name || `${u.host}:${u.port}`,
    type: "vless",
    server: u.host,
    port: toPort(u.port),
    uuid: u.userinfo,
    udp: true,
    flow: p.get("flow") || undefined,
    encryption: p.get("encryption") && p.get("encryption") !== "none" ? p.get("encryption") : undefined,
    tls: tls || undefined,
    servername: tls ? p.get("sni") || p.get("peer") || undefined : undefined,
    alpn: splitList(p.get("alpn")),
    "client-fingerprint": p.get("fp") || (security === "reality" ? "chrome" : undefined),
    "skip-cert-verify": truthy(p.get("allowInsecure")) || truthy(p.get("insecure")) || undefined,
    "reality-opts":
      security === "reality" ? compact({ "public-key": p.get("pbk"), "short-id": p.get("sid") ?? undefined }) : undefined,
    ...transportOptions({
      network: p.get("type"),
      headerType: p.get("headerType"),
      host: p.get("host"),
      path: p.get("path"),
      serviceName: p.get("serviceName"),
    }),
  });
}
