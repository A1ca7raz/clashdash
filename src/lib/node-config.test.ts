import { describe, expect, it } from "vitest";
import { parseManualNodeConfig } from "./node-config";

describe("manual node YAML config", () => {
  it("expands a global password pointer before reading the node", () => {
    expect(
      parseManualNodeConfig("name: Shared node\ntype: ss\nserver: example.com\nport: 443\npassword: *nodePassword\n", [
        { name: "nodePassword", value: "secret" },
      ]),
    ).toEqual({ name: "Shared node", type: "ss", server: "example.com", port: 443, password: "secret" });
  });

  it("rejects malformed YAML, non-password pointers and configs without name or type", () => {
    expect(() => parseManualNodeConfig("name: [")).toThrow("YAML 语法错误");
    expect(() => parseManualNodeConfig("name: node\ntype: ss\npassword: *missing")).toThrow("Unknown YAML pointer");
    expect(() =>
      parseManualNodeConfig("name: node\ntype: ss\nserver: *nodeServer", [{ name: "nodeServer", value: "example.com" }]),
    ).toThrow("只能作为 password 字段的值");
    expect(() => parseManualNodeConfig("name: node")).toThrow("name 和 type");
  });
});
