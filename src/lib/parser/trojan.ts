import type { MihomoProxy } from "@/lib/types";
import { compact, ParseError, splitList, splitUri, toPort, transportOptions, truthy } from "./util";

export function parseTrojan(uri: string): MihomoProxy {
  const u = splitUri(uri);
  if (!u.userinfo) throw new ParseError("trojan 链接缺少密码");
  const p = u.params;
  const security = p.get("security");

  return compact({
    name: u.name || `${u.host}:${u.port}`,
    type: "trojan",
    server: u.host,
    port: toPort(u.port),
    password: u.userinfo,
    udp: true,
    sni: p.get("sni") || p.get("peer") || undefined,
    alpn: splitList(p.get("alpn")),
    "client-fingerprint": p.get("fp") || undefined,
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
