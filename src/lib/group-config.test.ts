import { describe, expect, it } from "vitest";
import type { ProxyGroup } from "@/db/schema";
import {
  formatGroupConfigError,
  groupToYaml,
  NEW_GROUP_TEMPLATE,
  parseGroupConfig,
  removeGroupSubscriptionsYaml,
  renameGroupSubscriptionYaml,
  updateGroupItemsYaml,
} from "./group-config";

const group: ProxyGroup = {
  id: 1,
  profileId: 2,
  name: "自动选择",
  type: "url-test",
  options: { url: "https://www.gstatic.com/generate_204", interval: 300, tolerance: 50 },
  members: {
    items: ["DIRECT"],
    sources: { all: false, subscriptions: [7, 3], manual: true },
    include: "香港|日本",
    exclude: "过期",
  },
  yaml: null,
  sort: 0,
};

describe("group config YAML", () => {
  it("parses the new group template", () => {
    expect(parseGroupConfig(NEW_GROUP_TEMPLATE)).toEqual({
      name: "节点选择",
      type: "select",
      options: {},
      members: { items: [], sources: { all: true, subscriptions: [], manual: true } },
    });
  });

  it("round-trips groups and writes subscription names", () => {
    const text = groupToYaml(group, [
      { id: 7, name: "Air" },
      { id: 3, name: "Backup" },
    ]);
    expect(text).toContain("- Air");
    expect(text).not.toContain("- 7");
    expect(parseGroupConfig(text)).toEqual({
      name: group.name,
      type: group.type,
      options: group.options,
      members: { ...group.members, sources: { ...group.members.sources, subscriptions: ["Air", "Backup"] } },
    });
  });

  it("applies defaults to a minimal group", () => {
    expect(parseGroupConfig("name: Proxy\ntype: select\n")).toEqual({
      name: "Proxy",
      type: "select",
      options: {},
      members: { items: [], sources: { all: true, subscriptions: [], manual: true } },
    });
  });

  it("rejects global pointers outside password before validation", () => {
    expect(() =>
      parseGroupConfig("name: *groupName\ntype: select\noptions: {}\n", [{ name: "groupName", value: "Proxy" }]),
    ).toThrow("只能作为 password 字段的值");
    expect(() =>
      parseGroupConfig("name: Proxy\ntype: select\noptions: *groupOptions\n", [{ name: "groupOptions", value: "secret" }]),
    ).toThrow("只能作为 password 字段的值");
  });

  it("updates targeted sequences while preserving unrelated aliases", () => {
    const yaml = `name: Proxy
type: select
password: *password
members:
  items: [Old, DIRECT]
  sources:
    all: false
    subscriptions: [Air, Backup]
    manual: false
`;
    const renamed = renameGroupSubscriptionYaml(updateGroupItemsYaml(yaml, "Old", "New"), "Air", "Main");
    expect(renamed).toContain("password: *password");
    expect(renamed).toMatch(/items: \[\s*New, DIRECT\s*\]/);
    expect(renamed).toMatch(/subscriptions: \[\s*Main, Backup\s*\]/);
    const removed = removeGroupSubscriptionsYaml(renamed, ["Main"]);
    expect(removed).toMatch(/subscriptions: \[\s*Backup\s*\]/);
    expect(removed).toContain("password: *password");
  });

  it("rejects malformed YAML, unknown fields and invalid options", () => {
    expect(() => parseGroupConfig("- name: Proxy")).toThrow("YAML 映射");
    expect(() => parseGroupConfig("name: Proxy\ntype: select\nunknown: true")).toThrow();
    expect(() => parseGroupConfig("name: Proxy\ntype: url-test\noptions:\n  interval: -1")).toThrow();
    expect(() => parseGroupConfig("name: Proxy\ntype: unknown")).toThrow();
  });

  it("formats validation errors with field paths", () => {
    try {
      parseGroupConfig("name: Proxy\ntype: select\noptions:\n  interval: nope");
      expect.unreachable();
    } catch (err) {
      expect(formatGroupConfigError(err)).toContain("options.interval");
    }
  });
});
