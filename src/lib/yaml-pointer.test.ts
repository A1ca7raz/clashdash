import { describe, expect, it } from "vitest";
import { isAlias, parseDocument, visit } from "yaml";
import {
  expandYamlPointers,
  materializeYamlPointer,
  parseYamlPointerValue,
  yamlPointerReferences,
  yamlPointerToString,
} from "./yaml-pointer";

function expand(text: string, pointers: Record<string, string>) {
  const doc = parseDocument(text);
  expandYamlPointers(
    doc,
    Object.entries(pointers).map(([name, value]) => ({ name, value })),
  );
  return doc;
}

describe("YAML pointers", () => {
  it("expands a global string as a password value", () => {
    const doc = expand("before: true\npassword: *global\n", { global: "secret" });
    expect(doc.toJS()).toEqual({ before: true, password: "secret" });
  });

  it.each(["name", "server", "url", "items", "options"])(
    "rejects a global pointer used as the %s value",
    (field) => {
      expect(() => expand(`${field}: *global\n`, { global: "secret" })).toThrow(
        "全局 YAML 密码指针「global」只能作为 password 字段的值",
      );
      expect(() => expand(`${field}: *missing\n`, {})).toThrow("只能作为 password 字段的值");
    },
  );

  it("rejects global pointers nested below a password field", () => {
    expect(() => expand("password: [*global]\n", { global: "secret" })).toThrow("只能作为 password 字段的值");
  });

  it("prefers local anchors on any field and preserves comments", () => {
    const doc = expand("# heading\nlocal: &shared\n  # inside\n  value: local\ncopy: *shared\nglobal: *shared\n", {
      shared: "global",
    });
    expect(doc.toJS()).toEqual({
      local: { value: "local" },
      copy: { value: "local" },
      global: { value: "local" },
    });
    expect(doc.toString()).toContain("# heading");
    expect(doc.toString()).toContain("# inside");
  });

  it("expands password globals nested in local anchors and rejects unknown names", () => {
    const doc = expand("local: &local\n  password: *global\ncopy: *local\n", { global: "secret" });
    expect(doc.toJS()).toEqual({ local: { password: "secret" }, copy: { password: "secret" } });
    expect(() => expand("password: *missing\n", {})).toThrow("Unknown YAML pointer: missing");
    expect(() => expand("value: &loop [*loop]\n", {})).toThrow("Circular YAML alias: loop");
  });

  it("creates independent values for repeated references and leaves no anchors or aliases", () => {
    const doc = expand(
      "local: &local { value: 1 }\nfirst: { password: *global }\nsecond: { password: *global }\nlocalCopy: *local\n",
      { global: "secret" },
    );
    const value = doc.toJS();
    expect(value.first).toEqual(value.second);
    expect(value.first).not.toBe(value.second);
    let aliases = 0;
    visit(doc, {
      Alias() {
        aliases++;
      },
      Value(_key, node) {
        expect(node.anchor).toBeUndefined();
      },
    });
    expect(aliases).toBe(0);
    expect(doc.toString()).not.toMatch(/[&*](?:global|local)/);
  });

  it("parses only a single-document YAML string", () => {
    expect(parseYamlPointerValue("&root\n# comment\nsecret\n")).toBe("secret");
    expect(parseYamlPointerValue('"true"')).toBe("true");
    expect(() => parseYamlPointerValue("*global")).toThrow();
    expect(() => parseYamlPointerValue("---\none\n---\ntwo\n")).toThrow();
  });

  it.each(["null", "~", "123", "1.5", "true", "false", "server: example.com", "[one, two]", ".nan", ".inf", "-.inf"])(
    "rejects non-string pointer value %s",
    (text) => {
      expect(() => parseYamlPointerValue(text)).toThrow("密码指针值必须是 YAML 字符串");
    },
  );

  it("scans only aliases that would resolve globally, without duplicates", () => {
    expect(yamlPointerReferences("local: &local 1\na: *local\nb: *global\nc: *global\nd: *other\n")).toEqual([
      "global",
      "other",
    ]);
    expect(() => yamlPointerReferences("invalid: [")).toThrow();
  });

  it("materializes only the target global alias and preserves other syntax", () => {
    const source =
      "# heading\nlocal: &local { value: 1 }\npassword: *global # keep\nnested:\n  password: *untouched\nlocalCopy: *local\n";
    const result = materializeYamlPointer(source, "global", "null");
    expect(result).toContain("# heading");
    expect(result).toContain("# keep");
    expect(result).toContain("local: &local");
    expect(result).toContain("password: *untouched");
    expect(result).toContain("localCopy: *local");
    expect(result).not.toContain("*global");
    const doc = parseDocument(result);
    expect(doc.get("password")).toBe("null");
    let hasOtherAlias = false;
    visit(doc, {
      Alias(_key, alias) {
        if (isAlias(alias) && alias.source === "untouched") hasOtherAlias = true;
      },
    });
    expect(hasOtherAlias).toBe(true);
  });

  it("does not materialize a same-named local alias", () => {
    const source = "local: &global secret\ncopy: *global\n";
    expect(materializeYamlPointer(source, "global", "other")).toBe(source);
  });

  it("stringifies string values for editors", () => {
    expect(yamlPointerToString("secret")).toBe("secret\n");
    expect(parseYamlPointerValue(yamlPointerToString("true"))).toBe("true");
  });
});
