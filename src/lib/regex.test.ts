import { describe, expect, it } from "vitest";
import { replaceAll, toRegExp, validatePattern } from "./regex";

describe("translatePattern", () => {
  it("treats CJK as word characters like regexp2", () => {
    expect(toRegExp("^\\w+$").test("香港01")).toBe(true);
    expect(toRegExp("\\bHK\\b").test("香港HK")).toBe(false);
    expect(toRegExp("\\bHK\\b").test("香港 HK 01")).toBe(true);
  });

  it("supports a leading (?i)", () => {
    expect(toRegExp("(?i)hong kong").test("HONG KONG 01")).toBe(true);
  });

  it("matches astral characters as single code points", () => {
    expect(toRegExp("^.\\s").test("🇭🇰 HK")).toBe(false);
    expect(toRegExp("^🇭🇰").test("🇭🇰 HK")).toBe(true);
  });

  it("rejects syntax that would diverge between engines", () => {
    expect(validatePattern("a(?i)b")).not.toBeNull();
    expect(validatePattern("(?P<x>a)")).not.toBeNull();
    expect(validatePattern("[\\W]")).not.toBeNull();
    expect(validatePattern("(")).not.toBeNull();
    expect(validatePattern("香港|HK")).toBeNull();
  });
});

describe("replaceAll (.NET substitution)", () => {
  it("expands numbered and named groups", () => {
    expect(replaceAll("HK-01", "(\\w+)-(\\d+)", "$2 $1")).toBe("01 HK");
    expect(replaceAll("HK-01", "(?<r>\\w+)-(\\d+)", "${r}_${2}")).toBe("HK_01");
    expect(replaceAll("a", "a", "$$")).toBe("$");
    expect(replaceAll("ab", "b", "[$&]")).toBe("a[b]");
  });

  it("replaces every match and keeps unknown references literally", () => {
    expect(replaceAll("a-b-c", "-", "_")).toBe("a_b_c");
    expect(replaceAll("ab", "(a)", "$9")).toBe("$9b");
  });
});
