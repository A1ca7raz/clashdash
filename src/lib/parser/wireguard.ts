import type { MihomoProxy } from "@/lib/types";
import { compact, ParseError, splitList, splitUri, toPort } from "./util";

/** wireguard://privatekey@host:port?publickey=&address=10.0.0.2/32,fd00::2/128&mtu=&reserved=1,2,3#name (also wg://) */
export function parseWireguard(uri: string): MihomoProxy {
  const u = splitUri(uri);
  const p = u.params;
  if (!u.userinfo) throw new ParseError("wireguard 链接缺少私钥");

  const addresses = splitList(p.get("address") || p.get("ip")) ?? [];
  const ipv4 = addresses.find((a) => !a.includes(":"));
  const ipv6 = addresses.find((a) => a.includes(":"));
  const reserved = splitList(p.get("reserved"));

  return compact({
    name: u.name || `${u.host}:${u.port}`,
    type: "wireguard",
    server: u.host,
    port: toPort(u.port),
    "private-key": u.userinfo,
    "public-key": p.get("publickey") || p.get("public-key") || undefined,
    "pre-shared-key": p.get("presharedkey") || p.get("pre-shared-key") || undefined,
    ip: ipv4?.split("/")[0],
    ipv6: ipv6?.split("/")[0],
    mtu: p.get("mtu") ? Number(p.get("mtu")) : undefined,
    reserved: reserved?.map(Number),
    udp: true,
  });
}
