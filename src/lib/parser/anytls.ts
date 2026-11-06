import type { MihomoProxy } from "@/lib/types";
import { compact, ParseError, splitList, splitUri, toPort, truthy } from "./util";

/** anytls://password@host:port?sni=&insecure=1&fp=#name */
export function parseAnytls(uri: string): MihomoProxy {
  const u = splitUri(uri);
  const p = u.params;
  if (!u.userinfo) throw new ParseError("anytls 链接缺少密码");

  return compact({
    name: u.name || `${u.host}:${u.port}`,
    type: "anytls",
    server: u.host,
    port: toPort(u.port),
    password: u.userinfo,
    udp: true,
    sni: p.get("sni") || p.get("peer") || undefined,
    alpn: splitList(p.get("alpn")),
    "client-fingerprint": p.get("fp") || undefined,
    "skip-cert-verify": truthy(p.get("insecure")) || truthy(p.get("allowInsecure")) || undefined,
  });
}
