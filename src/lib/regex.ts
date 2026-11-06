/**
 * mihomo compiles filters and override.proxy-name with dlclark/regexp2 (.NET semantics,
 * RegexOptions.None). This module translates such a pattern into a JS RegExp that matches
 * the same names, so the server-side snapshot agrees with what the client computes.
 *
 * Differences handled:
 * - `\w` `\d` `\b` `\B` are Unicode-aware in .NET (CJK counts as a word char), ASCII-only in JS.
 * - A leading `(?i)` is .NET inline syntax; JS needs the `i` flag.
 * - .NET runs on code points; JS needs the `u` flag for astral characters such as flag emoji.
 * Anything that can't be translated faithfully is rejected instead of silently diverging.
 */

const WORD = "\\p{L}\\p{Mn}\\p{Nd}\\p{Pc}";
const WORD_CLASS = `[${WORD}]`;
const BOUNDARY = `(?:(?<=${WORD_CLASS})(?!${WORD_CLASS})|(?<!${WORD_CLASS})(?=${WORD_CLASS}))`;
const NON_BOUNDARY = `(?:(?<=${WORD_CLASS})(?=${WORD_CLASS})|(?<!${WORD_CLASS})(?!${WORD_CLASS}))`;

export class RegexCompatError extends Error {}

export interface CompiledRegex {
  source: string;
  flags: string;
}

export function translatePattern(pattern: string): CompiledRegex {
  let src = pattern;
  let flags = "u";
  if (src.startsWith("(?i)")) {
    src = src.slice(4);
    flags += "i";
  }

  let out = "";
  let inClass = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "\\") {
      const next = src[i + 1];
      if (next === undefined) throw new RegexCompatError("正则以反斜杠结尾");
      i++;
      switch (next) {
        case "w":
          out += inClass ? WORD : WORD_CLASS;
          break;
        case "W":
          if (inClass) throw new RegexCompatError("字符类中不支持 \\W，请改写");
          out += `[^${WORD}]`;
          break;
        case "d":
          out += "\\p{Nd}";
          break;
        case "D":
          out += "\\P{Nd}";
          break;
        case "b":
          if (inClass) throw new RegexCompatError("字符类中不支持 \\b");
          out += BOUNDARY;
          break;
        case "B":
          if (inClass) throw new RegexCompatError("字符类中不支持 \\B");
          out += NON_BOUNDARY;
          break;
        default:
          out += "\\" + next;
      }
      continue;
    }
    if (inClass) {
      if (ch === "]") inClass = false;
      out += ch;
      continue;
    }
    if (ch === "[") {
      inClass = true;
      out += ch;
      if (src[i + 1] === "^") {
        out += "^";
        i++;
      }
      // A leading "]" is a literal in .NET; JS (u flag) requires it escaped.
      if (src[i + 1] === "]") {
        out += "\\]";
        i++;
      }
      continue;
    }
    if (ch === "(" && src[i + 1] === "?") {
      const rest = src.slice(i + 2);
      if (/^[imnsx-]+[):]/.test(rest)) {
        throw new RegexCompatError("仅支持写在开头的 (?i)，不支持其他内联选项");
      }
      if (rest.startsWith("P<")) throw new RegexCompatError("不支持 (?P<name>) 命名分组，请用 (?<name>)");
      if (rest.startsWith("#")) throw new RegexCompatError("不支持 (?#) 注释");
    }
    out += ch;
  }

  try {
    new RegExp(out, flags);
  } catch (err) {
    throw new RegexCompatError(`正则无效：${(err as Error).message}`);
  }
  return { source: out, flags };
}

export function toRegExp(pattern: string, extraFlags = ""): RegExp {
  const { source, flags } = translatePattern(pattern);
  return new RegExp(source, flags + extraFlags);
}

/** Returns an error message, or null when the pattern is usable in both engines. */
export function validatePattern(pattern: string): string | null {
  try {
    translatePattern(pattern);
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

/** mihomo splits filter strings on backticks; each part is a separate regex. */
export function splitFilter(filter: string): string[] {
  return filter.split("`");
}

export function validateFilter(filter: string): string | null {
  for (const part of splitFilter(filter)) {
    const err = validatePattern(part);
    if (err) return err;
  }
  return null;
}

/**
 * Applies a .NET-style replacement (regexp2 Regexp.Replace): `$$`, `$&`, `$0`, `$n`, `${n}`,
 * `${name}`. Unknown references are kept literally, as .NET does.
 */
export function replaceAll(input: string, pattern: string, target: string): string {
  const re = toRegExp(pattern, "g");
  return input.replace(re, (...args) => {
    const hasGroups = typeof args[args.length - 1] === "object";
    const groups = (hasGroups ? args[args.length - 1] : undefined) as Record<string, string> | undefined;
    const captures = args.slice(0, hasGroups ? -3 : -2) as (string | undefined)[];
    return expandTarget(target, captures, groups);
  });
}

function expandTarget(
  target: string,
  captures: (string | undefined)[],
  groups: Record<string, string> | undefined,
): string {
  let out = "";
  for (let i = 0; i < target.length; i++) {
    const ch = target[i];
    if (ch !== "$" || i === target.length - 1) {
      out += ch;
      continue;
    }
    const next = target[i + 1];
    if (next === "$") {
      out += "$";
      i++;
    } else if (next === "&") {
      out += captures[0] ?? "";
      i++;
    } else if (next === "{") {
      const end = target.indexOf("}", i + 2);
      const ref = end === -1 ? "" : target.slice(i + 2, end);
      if (/^\d+$/.test(ref) && Number(ref) < captures.length) {
        out += captures[Number(ref)] ?? "";
        i = end;
      } else if (ref && groups && ref in groups) {
        out += groups[ref] ?? "";
        i = end;
      } else {
        out += ch;
      }
    } else if (/\d/.test(next)) {
      // .NET takes the longest digit run that names an existing group.
      let j = i + 1;
      while (j < target.length && /\d/.test(target[j])) j++;
      let digits = target.slice(i + 1, j);
      while (digits.length > 0 && Number(digits) >= captures.length) digits = digits.slice(0, -1);
      if (digits.length === 0) {
        out += ch;
      } else {
        out += captures[Number(digits)] ?? "";
        i += digits.length;
      }
    } else {
      out += ch;
    }
  }
  return out;
}
