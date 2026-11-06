import { describe, expect, it } from "vitest";
import { parseRuleLine, parseRuleLines } from "./rule-line";

describe("parseRuleLine", () => {
  it("parses simple, no-resolve and MATCH rules", () => {
    expect(parseRuleLine("DOMAIN-SUFFIX,google.com,Proxy")).toEqual({ type: "DOMAIN-SUFFIX", payload: "google.com", target: "Proxy", noResolve: false });
    expect(parseRuleLine("- 'IP-CIDR,10.0.0.0/8,DIRECT,no-resolve'")).toMatchObject({ payload: "10.0.0.0/8", noResolve: true });
    expect(parseRuleLine("MATCH,Final")).toEqual({ type: "MATCH", payload: "", target: "Final", noResolve: false });
  });

  it("keeps commas inside logic rule payloads", () => {
    expect(parseRuleLine("AND,((DOMAIN,a.com),(NETWORK,UDP)),REJECT")).toMatchObject({
      type: "AND",
      payload: "((DOMAIN,a.com),(NETWORK,UDP))",
      target: "REJECT",
    });
    expect(parseRuleLine("SUB-RULE,(NETWORK,tcp),work")).toMatchObject({ payload: "(NETWORK,tcp)", target: "work" });
  });

  it("rejects unknown types and malformed lines", () => {
    expect(() => parseRuleLine("FOO,a,b")).toThrow();
    expect(() => parseRuleLine("DOMAIN,a.com")).toThrow();
  });
});

describe("parseRuleLines", () => {
  it("skips blanks and comments, reports bad lines by number", () => {
    const r = parseRuleLines("# c\nDOMAIN,a.com,DIRECT\n\nBAD\n");
    expect(r.rules).toHaveLength(1);
    expect(r.errors[0]).toContain("第 4 行");
  });
});
