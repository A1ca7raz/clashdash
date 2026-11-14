import { describe, expect, it } from "vitest";
import type { Listener } from "@/db/schema";
import { listenerToYaml, parseListenerConfig, updateListenerYaml } from "./listener-config";

const listener: Listener = {
  id: 1,
  name: "work",
  type: "mixed",
  listen: "127.0.0.1",
  port: 7891,
  proxy: null,
  subRule: "office",
  options: { udp: true, "size-limit": 1024 },
  yaml: null,
  enabled: false,
  sort: 0,
};

describe("listener YAML config", () => {
  it("round-trips native fields and options without internal fields", () => {
    const yaml = listenerToYaml(listener);
    expect(yaml).toContain("rule: office");
    expect(yaml).not.toContain("enabled:");
    expect(parseListenerConfig(yaml)).toEqual({
      name: "work",
      type: "mixed",
      listen: "127.0.0.1",
      port: 7891,
      proxy: null,
      subRule: "office",
      options: { udp: true, "size-limit": 1024 },
    });
  });

  it("applies defaults and allows tun without a port", () => {
    expect(parseListenerConfig("name: tun0\ntype: tun\nstack: mixed\n")).toEqual({
      name: "tun0",
      type: "tun",
      listen: "0.0.0.0",
      port: null,
      proxy: null,
      subRule: null,
      options: { stack: "mixed" },
    });
  });

  it("expands password pointers and updates managed fields without expanding other aliases", () => {
    const yaml = "name: work\ntype: mixed\nport: 7891\nproxy: Proxy\npassword: *password\n";
    expect(parseListenerConfig(yaml, [{ name: "password", value: "secret" }])).toMatchObject({
      proxy: "Proxy",
      options: { password: "secret" },
    });
    expect(() =>
      parseListenerConfig("name: work\ntype: mixed\nport: 7891\nproxy: *route\n", [{ name: "route", value: "Proxy" }]),
    ).toThrow("只能作为 password 字段的值");

    const updated = updateListenerYaml(yaml, { name: "copy", proxy: "Other" });
    expect(updated).toContain("name: copy");
    expect(updated).toContain("proxy: Other");
    expect(updated).toContain("password: *password");
  });

  it("rejects invalid YAML and non-map roots", () => {
    expect(() => parseListenerConfig("name: [")).toThrow("YAML 语法错误");
    expect(() => parseListenerConfig("- mixed")).toThrow("YAML 映射");
  });

  it("rejects invalid types, missing ports and conflicting routes", () => {
    expect(() => parseListenerConfig("name: bad\ntype: unknown\nport: 7891\n")).toThrow();
    expect(() => parseListenerConfig("name: bad\ntype: mixed\n")).toThrow();
    expect(() => parseListenerConfig("name: bad\ntype: mixed\nport: 7891\nproxy: DIRECT\nrule: work\n")).toThrow();
  });
});
