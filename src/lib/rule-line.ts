import { RULE_TYPES } from "@/lib/types";

export interface ParsedRule {
  type: string;
  payload: string;
  target: string;
  noResolve: boolean;
}

const KNOWN = new Set<string>(RULE_TYPES);

/** Splits on top-level commas only; logic rules nest commas inside parentheses. */
function splitTopLevel(line: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of line) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur.trim());
  return parts;
}

/** Parses "TYPE,payload,target[,no-resolve]" (or "MATCH,target"); accepts YAML list markers and quotes. */
export function parseRuleLine(raw: string): ParsedRule {
  const line = raw
    .trim()
    .replace(/^-\s*/, "")
    .replace(/^(['"])(.*)\1$/, "$2")
    .trim();
  const parts = splitTopLevel(line);
  const type = parts[0]?.toUpperCase();
  if (!type || !KNOWN.has(type)) throw new Error(`未知的规则类型：${parts[0] ?? ""}`);

  if (type === "MATCH") {
    if (!parts[1]) throw new Error("MATCH 规则缺少目标");
    return { type, payload: "", target: parts[1], noResolve: false };
  }
  const noResolve = parts.length > 3 && parts[parts.length - 1].toLowerCase() === "no-resolve";
  const rest = noResolve ? parts.slice(1, -1) : parts.slice(1);
  if (rest.length < 2) throw new Error(`规则缺少内容或目标：${line}`);
  if (rest.length > 2) throw new Error(`规则字段过多：${line}`);
  return { type, payload: rest[0], target: rest[1], noResolve };
}

export function parseRuleLines(text: string): { rules: ParsedRule[]; errors: string[] } {
  const rules: ParsedRule[] = [];
  const errors: string[] = [];
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    try {
      rules.push(parseRuleLine(raw));
    } catch (err) {
      errors.push(`第 ${i + 1} 行：${(err as Error).message}`);
    }
  }
  return { rules, errors };
}
