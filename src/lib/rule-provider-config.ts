import { isMap, parseDocument, stringify } from "yaml";
import { z, ZodError } from "zod";
import type { RuleProvider } from "@/db/schema";
import { RULE_PROVIDER_BEHAVIORS, RULE_PROVIDER_FORMATS } from "@/lib/types";

const MANAGED_FIELDS = new Set(["name", "type", "behavior", "format", "url", "interval", "payload"]);
const name = z.string().trim().min(1, "不能为空").regex(/^[^,\s]+$/, "不能包含逗号或空白");
const behavior = z.enum(RULE_PROVIDER_BEHAVIORS);

const providerSchema = z
  .discriminatedUnion("type", [
    z
      .object({
        name,
        type: z.literal("http"),
        behavior,
        format: z.enum(RULE_PROVIDER_FORMATS).default("mrs"),
        url: z.string().trim().url("不是有效的地址"),
        interval: z.number().int().min(60).default(86400),
      })
      .passthrough(),
    z
      .object({
        name,
        type: z.literal("inline"),
        behavior,
        payload: z.array(z.string().trim().min(1, "规则不能为空")).min(1, "至少添加一条规则"),
      })
      .passthrough(),
  ])
  .refine((v) => v.type !== "http" || !(v.format === "mrs" && v.behavior === "classical"), {
    message: "mrs 格式不支持 classical 类型",
    path: ["format"],
  });

export interface RuleProviderConfigValues {
  name: string;
  type: "http" | "inline";
  behavior: (typeof RULE_PROVIDER_BEHAVIORS)[number];
  format: (typeof RULE_PROVIDER_FORMATS)[number];
  url: string | null;
  interval: number;
  payload: string[];
  options: Record<string, unknown>;
}

export const NEW_RULE_PROVIDER_TEMPLATE = `name: 我的规则集
type: http
behavior: domain
format: yaml
url: https://example.com/rules.yaml
interval: 86400
`;

export function parseRuleProviderConfig(text: string): RuleProviderConfigValues {
  const doc = parseDocument(text);
  if (doc.errors.length) throw new Error(`YAML 语法错误：${doc.errors[0].message}`);
  if (!isMap(doc.contents)) throw new Error("规则集配置必须是 YAML 映射");
  const parsed = providerSchema.parse(doc.toJS());
  const options = Object.fromEntries(Object.entries(parsed).filter(([key]) => !MANAGED_FIELDS.has(key)));
  if (parsed.type === "inline") {
    return {
      name: parsed.name,
      type: parsed.type,
      behavior: parsed.behavior,
      format: "mrs",
      url: null,
      interval: 86400,
      payload: parsed.payload,
      options,
    };
  }
  return {
    name: parsed.name,
    type: parsed.type,
    behavior: parsed.behavior,
    format: parsed.format,
    url: parsed.url,
    interval: parsed.interval,
    payload: [],
    options,
  };
}

export function ruleProviderToYaml(provider: RuleProvider): string {
  const options = Object.fromEntries(Object.entries(provider.options).filter(([key]) => !MANAGED_FIELDS.has(key)));
  return stringify({
    name: provider.name,
    type: provider.type,
    behavior: provider.behavior,
    ...(provider.type === "inline"
      ? { payload: provider.payload }
      : { format: provider.format, url: provider.url, interval: provider.interval }),
    ...options,
  });
}

export function formatRuleProviderConfigError(err: unknown): string {
  if (err instanceof ZodError) return err.issues.map((i) => `${i.path.join(".") || "配置"}：${i.message}`).join("；");
  return err instanceof Error ? err.message : String(err);
}
