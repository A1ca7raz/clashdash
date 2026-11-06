import type { MihomoProxy } from "@/lib/types";
import { compact, ParseError, splitList, splitUri, toPort, truthy } from "./util";

/** tuic://uuid:password@host:port?congestion_control=bbr&udp_relay_mode=native&alpn=h3&sni=#name */
export function parseTuic(uri: string): MihomoProxy {
  const u = splitUri(uri);
  const p = u.params;
  const idx = u.userinfo.indexOf(":");
  if (idx < 0) throw new ParseError("tuic 链接缺少 UUID 或密码");

  return compact({
    name: u.name || `${u.host}:${u.port}`,
    type: "tuic",
    server: u.host,
    port: toPort(u.port),
    uuid: u.userinfo.slice(0, idx),
    password: u.userinfo.slice(idx + 1),
    udp: true,
    "congestion-controller": p.get("congestion_control") || p.get("congestion-controller") || undefined,
    "udp-relay-mode": p.get("udp_relay_mode") || p.get("udp-relay-mode") || undefined,
    alpn: splitList(p.get("alpn")),
    sni: p.get("sni") || undefined,
    "disable-sni": truthy(p.get("disable_sni")) || undefined,
    "reduce-rtt": truthy(p.get("reduce_rtt")) || undefined,
    "skip-cert-verify": truthy(p.get("allow_insecure")) || truthy(p.get("insecure")) || undefined,
  });
}
