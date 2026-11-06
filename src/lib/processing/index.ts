import { replaceAll, splitFilter, toRegExp, validateFilter, validatePattern } from "@/lib/regex";
import type { Processing } from "@/lib/types";
import { flagRenameRules } from "./flags";

/** The mihomo proxy-provider fields a Processing compiles to. */
export interface ProviderProcessing {
  filter?: string;
  "exclude-filter"?: string;
  override?: {
    "proxy-name"?: { pattern: string; target: string }[];
    "additional-prefix"?: string;
    "additional-suffix"?: string;
  };
}

export function compileProcessing(p: Processing): ProviderProcessing {
  const out: ProviderProcessing = {};
  if (p.include) out.filter = p.include;
  if (p.exclude) out["exclude-filter"] = p.exclude;

  const proxyName = [...(p.rename ?? []).filter((r) => r.pattern), ...(p.flag ? flagRenameRules() : [])];
  const override: NonNullable<ProviderProcessing["override"]> = {};
  if (proxyName.length) override["proxy-name"] = proxyName;
  if (p.prefix) override["additional-prefix"] = p.prefix;
  if (p.suffix) override["additional-suffix"] = p.suffix;
  if (Object.keys(override).length) out.override = override;
  return out;
}

export interface ProcessedNode<T> {
  node: T;
  originalName: string;
  name: string;
}

/**
 * Reproduces mihomo's proxy-provider parser on already-parsed nodes: exclude-filter and filter
 * match the original name, output is ordered by filter part, duplicates (by original name) are
 * dropped, then override renames apply.
 */
export function applyProcessing<T extends { name: string }>(items: T[], p: Processing): ProcessedNode<T>[] {
  const compiled = compileProcessing(p);
  const excludes = compiled["exclude-filter"] ? splitFilter(compiled["exclude-filter"]).map((f) => toRegExp(f)) : [];
  const filterParts = compiled.filter ? splitFilter(compiled.filter).map((f) => toRegExp(f)) : [null];
  const renames = compiled.override?.["proxy-name"] ?? [];
  const prefix = compiled.override?.["additional-prefix"] ?? "";
  const suffix = compiled.override?.["additional-suffix"] ?? "";

  const seen = new Set<string>();
  const out: ProcessedNode<T>[] = [];
  for (const filterRe of filterParts) {
    for (const node of items) {
      const original = node.name;
      if (excludes.some((re) => re.test(original))) continue;
      if (filterRe && !filterRe.test(original)) continue;
      if (seen.has(original)) continue;
      seen.add(original);

      let name = original;
      for (const r of renames) name = replaceAll(name, r.pattern, r.target);
      name = prefix + name + suffix;
      out.push({ node, originalName: original, name });
    }
  }
  return out;
}

/** Proxy-group filter semantics: union of backtick parts, ordered by part; exclude applies after. */
export function matchGroupFilter(names: string[], include?: string, exclude?: string): string[] {
  let result = names;
  if (include) {
    const seen = new Set<string>();
    result = [];
    for (const part of splitFilter(include)) {
      const re = toRegExp(part);
      for (const n of names) {
        if (!seen.has(n) && re.test(n)) {
          seen.add(n);
          result.push(n);
        }
      }
    }
  }
  if (exclude) {
    const res = splitFilter(exclude).map((f) => toRegExp(f));
    result = result.filter((n) => !res.some((re) => re.test(n)));
  }
  return result;
}

export function validateProcessing(p: Processing): string[] {
  const errors: string[] = [];
  const check = (label: string, err: string | null) => err && errors.push(`${label}：${err}`);
  if (p.include) check("包含过滤", validateFilter(p.include));
  if (p.exclude) check("排除过滤", validateFilter(p.exclude));
  (p.rename ?? []).forEach((r, i) => r.pattern && check(`改名规则 ${i + 1}`, validatePattern(r.pattern)));
  return errors;
}
