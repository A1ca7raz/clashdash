import type { MihomoProxy } from "@/lib/types";
import { compact, decodeBase64, ParseError, safeDecode, splitUri, toPort } from "./util";

export function parseSs(uri: string): MihomoProxy {
  // Legacy form: ss://base64(method:password@host:port)[?plugin=..]#name. Base64 may contain "/",
  // so decode before splitting.
  const body = uri.slice("ss://".length);
  const hashIdx = body.indexOf("#");
  const main = hashIdx >= 0 ? body.slice(0, hashIdx) : body;
  if (!main.includes("@")) {
    const [b64, query] = main.split("?");
    uri = `ss://${decodeBase64(b64)}${query ? `?${query}` : ""}${hashIdx >= 0 ? body.slice(hashIdx) : ""}`;
  }
  const u = splitUri(uri);

  const userinfo = u.userinfo.includes(":") ? u.userinfo : decodeBase64(u.userinfo);
  const idx = userinfo.indexOf(":");
  if (idx < 0) throw new ParseError("ss 链接缺少加密方式或密码");
  const method = userinfo.slice(0, idx).trim();
  const password = safeDecode(userinfo.slice(idx + 1));

  const proxy: MihomoProxy = {
    name: u.name || `${u.host}:${u.port}`,
    type: "ss",
    server: u.host,
    port: toPort(u.port),
    cipher: method,
    password,
    udp: true,
  };

  const plugin = u.params.get("plugin");
  if (plugin) {
    const [pluginName, ...opts] = plugin.split(";");
    const kv = Object.fromEntries(
      opts.map((o) => {
        const i = o.indexOf("=");
        return i < 0 ? [o, "true"] : [o.slice(0, i), o.slice(i + 1)];
      }),
    );
    if (pluginName === "obfs-local" || pluginName === "simple-obfs") {
      proxy.plugin = "obfs";
      proxy["plugin-opts"] = compact({ mode: kv.obfs, host: kv["obfs-host"] });
    } else if (pluginName === "v2ray-plugin") {
      proxy.plugin = "v2ray-plugin";
      proxy["plugin-opts"] = compact({
        mode: kv.mode || "websocket",
        host: kv.host,
        path: kv.path,
        tls: "tls" in kv ? true : undefined,
        mux: "mux" in kv ? true : undefined,
      });
    } else if (pluginName === "shadow-tls") {
      proxy.plugin = "shadow-tls";
      proxy["plugin-opts"] = compact({ host: kv.host, password: kv.password, version: kv.version ? Number(kv.version) : undefined });
    } else {
      throw new ParseError(`不支持的 ss 插件：${pluginName}`);
    }
  }
  return proxy;
}
