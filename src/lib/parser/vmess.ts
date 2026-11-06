import type { MihomoProxy } from "@/lib/types";
import { compact, decodeBase64, ParseError, splitList, toPort, transportOptions, truthy } from "./util";

interface VmessJson {
  ps?: string;
  add?: string;
  port?: string | number;
  id?: string;
  aid?: string | number;
  scy?: string;
  net?: string;
  type?: string;
  host?: string;
  path?: string;
  tls?: string;
  sni?: string;
  alpn?: string;
  fp?: string;
  allowInsecure?: string | number | boolean;
}

export function parseVmess(uri: string): MihomoProxy {
  let json: VmessJson;
  try {
    json = JSON.parse(decodeBase64(uri.slice("vmess://".length)));
  } catch {
    throw new ParseError("vmess 链接不是有效的 base64 JSON");
  }
  if (!json.add || !json.id) throw new ParseError("vmess 链接缺少服务器或 UUID");

  const tls = json.tls === "tls" || json.tls === "reality";
  return compact({
    name: json.ps || `${json.add}:${json.port}`,
    type: "vmess",
    server: json.add,
    port: toPort(json.port),
    uuid: json.id,
    alterId: Number(json.aid ?? 0) || 0,
    cipher: json.scy || "auto",
    udp: true,
    tls: tls || undefined,
    servername: tls ? json.sni || json.host?.split(",")[0] : undefined,
    alpn: splitList(json.alpn),
    "client-fingerprint": json.fp,
    "skip-cert-verify": truthy(String(json.allowInsecure ?? "")) || undefined,
    ...transportOptions({
      network: json.net,
      headerType: json.type,
      host: json.host,
      path: json.path,
      serviceName: json.net === "grpc" ? json.path : undefined,
    }),
  });
}
