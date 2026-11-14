import { describe, expect, it } from "vitest";
import {
  formatSubscriptionConfigError,
  NEW_PROVIDER_TEMPLATE,
  parseProviderSubscription,
  providerSubscriptionToYaml,
  type SubscriptionInput,
} from "./subscription-config";

const subscription: SubscriptionInput = {
  id: 9,
  mode: "provider",
  name: "Air",
  url: "https://example.com/sub",
  userAgent: "mihomo",
  enabled: false,
  cacheTtl: 7200,
  providerOptions: {
    interval: 1800,
    healthCheck: { enable: true, url: "https://www.gstatic.com/generate_204", interval: 100, lazy: false },
  },
  processing: {
    include: "香港|HK",
    exclude: "过期",
    rename: [{ pattern: "^HK", target: "香港" }],
    flag: true,
    prefix: "P-",
    suffix: "-S",
  },
};

describe("provider subscription YAML", () => {
  it("parses the new provider template", () => {
    expect(parseProviderSubscription(NEW_PROVIDER_TEMPLATE)).toMatchObject({
      name: "我的订阅",
      url: "https://example.com/sub",
      enabled: true,
      cacheTtl: 3600,
      providerOptions: { interval: 3600, healthCheck: { enable: false } },
      processing: {},
    });
  });

  it("round-trips editable fields without internal id or mode", () => {
    const text = providerSubscriptionToYaml(subscription);
    expect(text).not.toContain("id:");
    expect(text).not.toContain("mode:");
    expect(parseProviderSubscription(text)).toEqual({
      name: subscription.name,
      url: subscription.url,
      userAgent: subscription.userAgent,
      enabled: subscription.enabled,
      cacheTtl: subscription.cacheTtl,
      providerOptions: subscription.providerOptions,
      processing: subscription.processing,
    });
  });

  it("applies defaults to a minimal provider", () => {
    expect(parseProviderSubscription("name: Air\nurl: https://example.com/sub\n")).toEqual({
      name: "Air",
      url: "https://example.com/sub",
      userAgent: "clash.meta",
      enabled: true,
      cacheTtl: 3600,
      providerOptions: {},
      processing: {},
    });
  });

  it("rejects global pointers outside password before validation", () => {
    expect(() =>
      parseProviderSubscription("name: Air\nurl: *endpoint\n", [{ name: "endpoint", value: "https://example.com/sub" }]),
    ).toThrow("只能作为 password 字段的值");
  });

  it("rejects malformed YAML, unknown fields and invalid values", () => {
    expect(() => parseProviderSubscription("- name: Air")).toThrow("YAML 映射");
    expect(() => parseProviderSubscription("name: Air\nurl: invalid")).toThrow();
    expect(() => parseProviderSubscription("name: Air\nurl: https://example.com\nunknown: true")).toThrow();
    expect(() =>
      parseProviderSubscription("name: Air\nurl: https://example.com\nproviderOptions:\n  healthCheck:\n    enable: true\n    interval: -1"),
    ).toThrow();
    expect(() => parseProviderSubscription("name: Air\nurl: https://example.com\ncacheTtl: 30")).toThrow("至少 60 秒");
  });

  it("formats nested validation paths", () => {
    try {
      parseProviderSubscription("name: Air\nurl: https://example.com\nprocessing:\n  flag: nope");
      expect.unreachable();
    } catch (err) {
      expect(formatSubscriptionConfigError(err)).toContain("processing.flag");
    }
  });
});
