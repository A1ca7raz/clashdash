import { describe, expect, it } from "vitest";
import { applyProcessing, compileProcessing, matchGroupFilter, validateProcessing } from ".";

const nodes = (...names: string[]) => names.map((name) => ({ name }));

describe("applyProcessing", () => {
  it("filters on the original name before renaming, in mihomo order", () => {
    const out = applyProcessing(nodes("香港 01", "日本 01", "剩余流量 10G", "香港 02"), {
      include: "香港`日本",
      exclude: "剩余",
      rename: [{ pattern: "\\s+0?(\\d+)$", target: "-$1" }],
      prefix: "[A] ",
      suffix: " *",
    });
    expect(out.map((o) => o.name)).toEqual(["[A] 香港-1 *", "[A] 香港-2 *", "[A] 日本-1 *"]);
  });

  it("drops duplicate original names like the provider parser", () => {
    expect(applyProcessing(nodes("a", "a", "b"), {}).map((o) => o.name)).toEqual(["a", "b"]);
  });

  it("adds a single flag, before the prefix, and never stacks flags", () => {
    const out = applyProcessing(nodes("香港 IPLC", "US 01", "Plus 01", "🇯🇵 东京", "香港-日本 中转"), {
      flag: true,
      prefix: "A|",
    });
    expect(out.map((o) => o.name)).toEqual(["A|🇭🇰 香港 IPLC", "A|🇺🇸 US 01", "A|Plus 01", "A|🇯🇵 东京", "A|🇭🇰 香港-日本 中转"]);
  });

  it("does not treat short codes inside words as regions", () => {
    expect(applyProcessing(nodes("Russia 01", "AUS 01", "SHK 01"), { flag: true }).map((o) => o.name)).toEqual([
      "🇷🇺 Russia 01",
      "🇦🇺 AUS 01",
      "SHK 01",
    ]);
  });
});

describe("compileProcessing", () => {
  it("maps to native proxy-provider fields with rename rules before flag rules", () => {
    const c = compileProcessing({ include: "HK", exclude: "x", rename: [{ pattern: "a", target: "b" }], flag: true, prefix: "P" });
    expect(c.filter).toBe("HK");
    expect(c["exclude-filter"]).toBe("x");
    expect(c.override?.["proxy-name"]?.[0]).toEqual({ pattern: "a", target: "b" });
    expect(c.override?.["proxy-name"]?.length).toBeGreaterThan(10);
    expect(c.override?.["additional-prefix"]).toBe("P");
    expect(compileProcessing({})).toEqual({});
  });
});

describe("matchGroupFilter", () => {
  it("orders by filter part and applies exclude afterwards", () => {
    expect(matchGroupFilter(["JP 1", "HK 1", "HK 2 x2"], "HK`JP", "x2")).toEqual(["HK 1", "JP 1"]);
  });
});

describe("validateProcessing", () => {
  it("reports invalid patterns with their location", () => {
    expect(validateProcessing({ include: "(", rename: [{ pattern: "a(?i)", target: "" }] })).toHaveLength(2);
  });
});
