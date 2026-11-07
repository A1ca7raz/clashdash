import { describe, expect, it } from "vitest";
import type { RuleProvider } from "@/db/schema";
import { parseRuleProviderConfig, ruleProviderToYaml } from "./rule-provider-config";

const now = new Date();

const httpProvider: RuleProvider = {
  id: 1,
  name: "remote",
  type: "http",
  behavior: "domain",
  format: "yaml",
  url: "https://example.com/rules.yaml",
  interval: 600,
  payload: [],
  options: { path: "./rules/remote.yaml", header: { "User-Agent": ["mihomo"] } },
  createdAt: now,
};

const inlineProvider: RuleProvider = {
  ...httpProvider,
  id: 2,
  name: "local",
  type: "inline",
  format: "mrs",
  url: null,
  interval: 86400,
  payload: ["DOMAIN-SUFFIX,example.com", "DOMAIN,internal.example"],
  options: {},
};

describe("rule provider YAML config", () => {
  it("round-trips HTTP fields and extension options", () => {
    expect(parseRuleProviderConfig(ruleProviderToYaml(httpProvider))).toEqual({
      name: "remote",
      type: "http",
      behavior: "domain",
      format: "yaml",
      url: "https://example.com/rules.yaml",
      interval: 600,
      payload: [],
      options: httpProvider.options,
    });
  });

  it("round-trips inline payload without requiring HTTP fields", () => {
    const yaml = ruleProviderToYaml(inlineProvider);
    expect(yaml).toContain("type: inline");
    expect(yaml).not.toContain("url:");
    expect(parseRuleProviderConfig(yaml)).toEqual({
      name: "local",
      type: "inline",
      behavior: "domain",
      format: "mrs",
      url: null,
      interval: 86400,
      payload: inlineProvider.payload,
      options: {},
    });
  });

  it("rejects empty inline payload and unsupported provider types", () => {
    expect(() => parseRuleProviderConfig("name: local\ntype: inline\nbehavior: domain\npayload: []\n")).toThrow();
    expect(() => parseRuleProviderConfig("name: file\ntype: file\nbehavior: domain\n")).toThrow();
  });

  it("retains HTTP validation and rejects malformed YAML", () => {
    expect(() =>
      parseRuleProviderConfig("name: remote\ntype: http\nbehavior: classical\nformat: mrs\nurl: https://example.com/r.mrs\n"),
    ).toThrow();
    expect(() => parseRuleProviderConfig("name: remote\ntype: http\nbehavior: domain\nurl: invalid\n")).toThrow();
    expect(() => parseRuleProviderConfig("name: [")).toThrow("YAML 语法错误");
  });
});
