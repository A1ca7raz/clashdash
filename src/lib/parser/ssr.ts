import type { MihomoProxy } from "@/lib/types";
import { compact, decodeBase64, ParseError, toPort } from "./util";

/** ssr://base64(host:port:protocol:method:obfs:base64(password)/?obfsparam=..&protoparam=..&remarks=..) */
export function parseSsr(uri: string): MihomoProxy {
  const decoded = decodeBase64(uri.slice("ssr://".length));
  const [main, query = ""] = decoded.split("/?");
  const parts = main.split(":");
  if (parts.length < 6) throw new ParseError("ssr 链接格式错误");
  const passwordB64 = parts.pop()!;
  const obfs = parts.pop()!;
  const method = parts.pop()!;
  const protocol = parts.pop()!;
  const port = parts.pop()!;
  const server = parts.join(":");
  const params = new URLSearchParams(query);
  const b64 = (key: string) => {
    const v = params.get(key);
    return v ? decodeBase64(v) : undefined;
  };

  return compact({
    name: b64("remarks") || `${server}:${port}`,
    type: "ssr",
    server,
    port: toPort(port),
    cipher: method,
    password: decodeBase64(passwordB64),
    protocol,
    obfs,
    "protocol-param": b64("protoparam"),
    "obfs-param": b64("obfsparam"),
    udp: true,
  });
}
