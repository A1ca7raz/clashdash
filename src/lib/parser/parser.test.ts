import { describe, expect, it } from "vitest";
import { parseSubscription, parseUri } from ".";

const b64 = (s: string) => Buffer.from(s).toString("base64");

describe("parseUri", () => {
  it("parses SIP002 and legacy ss links", () => {
    expect(parseUri(`ss://${b64("aes-256-gcm:pa/ss")}@1.2.3.4:8388#HK%2001`)).toMatchObject({
      name: "HK 01",
      type: "ss",
      server: "1.2.3.4",
      port: 8388,
      cipher: "aes-256-gcm",
      password: "pa/ss",
    });
    expect(parseUri(`ss://${b64("chacha20-ietf-poly1305:p@ss@example.com:443")}#Legacy`)).toMatchObject({
      server: "example.com",
      port: 443,
      password: "p@ss",
      name: "Legacy",
    });
    expect(parseUri("ss://2022-blake3-aes-128-gcm:abc%3D@[2001:db8::1]:443?plugin=obfs-local%3Bobfs%3Dhttp%3Bobfs-host%3Da.com#v6")).toMatchObject({
      server: "2001:db8::1",
      cipher: "2022-blake3-aes-128-gcm",
      password: "abc=",
      plugin: "obfs",
      "plugin-opts": { mode: "http", host: "a.com" },
    });
  });

  it("parses ssr", () => {
    const inner = `host.com:443:auth_aes128_md5:aes-256-cfb:tls1.2_ticket_auth:${b64("pwd")}/?remarks=${b64("SSR 节点")}&obfsparam=${b64("obfs.com")}`;
    expect(parseUri(`ssr://${b64(inner)}`)).toMatchObject({
      name: "SSR 节点",
      type: "ssr",
      server: "host.com",
      port: 443,
      cipher: "aes-256-cfb",
      password: "pwd",
      protocol: "auth_aes128_md5",
      obfs: "tls1.2_ticket_auth",
      "obfs-param": "obfs.com",
    });
  });

  it("parses vmess ws+tls", () => {
    const json = { v: "2", ps: "VM", add: "v.com", port: "443", id: "uuid", aid: "0", net: "ws", host: "cdn.com", path: "/ws", tls: "tls", sni: "s.com" };
    expect(parseUri(`vmess://${b64(JSON.stringify(json))}`)).toMatchObject({
      name: "VM",
      type: "vmess",
      uuid: "uuid",
      alterId: 0,
      cipher: "auto",
      tls: true,
      servername: "s.com",
      network: "ws",
      "ws-opts": { path: "/ws", headers: { Host: "cdn.com" } },
    });
  });

  it("parses vless reality and grpc", () => {
    const p = parseUri("vless://uuid@1.1.1.1:443?security=reality&sni=www.apple.com&pbk=PK&sid=ab&fp=chrome&flow=xtls-rprx-vision&type=tcp#R");
    expect(p).toMatchObject({
      type: "vless",
      tls: true,
      servername: "www.apple.com",
      flow: "xtls-rprx-vision",
      "reality-opts": { "public-key": "PK", "short-id": "ab" },
      "client-fingerprint": "chrome",
    });
    expect(p.network).toBeUndefined();
    expect(parseUri("vless://u@h:443?security=tls&type=grpc&serviceName=svc#G")).toMatchObject({
      network: "grpc",
      "grpc-opts": { "grpc-service-name": "svc" },
    });
  });

  it("parses trojan, hysteria2 with port hopping, tuic, wireguard, anytls", () => {
    expect(parseUri("trojan://pw@t.com:443?sni=s.com&allowInsecure=1#T")).toMatchObject({
      type: "trojan",
      password: "pw",
      sni: "s.com",
      "skip-cert-verify": true,
    });
    expect(parseUri("hy2://auth@h.com:443,20000-30000/?sni=s.com&obfs=salamander&obfs-password=x#H")).toMatchObject({
      type: "hysteria2",
      port: 443,
      ports: "443,20000-30000",
      password: "auth",
      obfs: "salamander",
      "obfs-password": "x",
    });
    expect(parseUri("tuic://uuid:pw@t.com:443?congestion_control=bbr&alpn=h3&sni=s.com#U")).toMatchObject({
      type: "tuic",
      uuid: "uuid",
      password: "pw",
      "congestion-controller": "bbr",
      alpn: ["h3"],
    });
    expect(parseUri("wg://priv@w.com:51820?publickey=pub&address=10.0.0.2/32,fd00::2/128&reserved=1,2,3&mtu=1280#W")).toMatchObject({
      type: "wireguard",
      "private-key": "priv",
      "public-key": "pub",
      ip: "10.0.0.2",
      ipv6: "fd00::2",
      reserved: [1, 2, 3],
      mtu: 1280,
    });
    expect(parseUri("anytls://pw@a.com:443?sni=s.com#A")).toMatchObject({ type: "anytls", password: "pw", sni: "s.com" });
  });

  it("rejects unknown schemes", () => {
    expect(() => parseUri("foo://bar")).toThrow();
  });
});

describe("parseSubscription", () => {
  it("detects clash YAML", () => {
    const r = parseSubscription("proxies:\n  - {name: A, type: ss, server: a, port: 1, cipher: aes-128-gcm, password: x}\n  - bad\n");
    expect(r.format).toBe("clash");
    expect(r.nodes.map((n) => n.name)).toEqual(["A"]);
    expect(r.errors).toHaveLength(1);
  });

  it("detects base64 and plain URI lists, collecting per-line errors", () => {
    const list = "trojan://pw@t.com:443#T1\nfoo://x\n\ntrojan://pw@t.com:444#T2";
    const plain = parseSubscription(list);
    expect(plain.format).toBe("uri");
    expect(plain.nodes).toHaveLength(2);
    expect(plain.errors).toHaveLength(1);
    const encoded = parseSubscription(b64(list));
    expect(encoded.format).toBe("base64");
    expect(encoded.nodes).toHaveLength(2);
  });

  it("reports unknown content", () => {
    expect(parseSubscription("<html>blocked</html>").nodes).toHaveLength(0);
  });
});
