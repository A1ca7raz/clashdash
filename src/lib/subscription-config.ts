import { isMap, parseDocument, stringify } from "yaml";
import { z, ZodError } from "zod";
import type { Subscription } from "@/db/schema";
import { expandYamlPointers, type YamlPointerDefinition } from "@/lib/yaml-pointer";

const processingSchema = z
  .object({
    include: z.string().optional(),
    exclude: z.string().optional(),
    rename: z.array(z.object({ pattern: z.string(), target: z.string() }).strict()).optional(),
    flag: z.boolean().optional(),
    prefix: z.string().optional(),
    suffix: z.string().optional(),
  })
  .strict();

const providerOptionsSchema = z
  .object({
    interval: z.number().int().positive().optional(),
    healthCheck: z
      .object({
        enable: z.boolean(),
        url: z.string().optional(),
        interval: z.number().int().positive().optional(),
        lazy: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const subscriptionFields = {
  name: z.string().trim().min(1, "不能为空"),
  url: z.string().trim().url("不是有效的地址"),
  userAgent: z.string().trim().default("clash.meta"),
  enabled: z.boolean().default(true),
  refreshInterval: z.number().int().min(60, "至少 60 秒").default(3600),
  processing: processingSchema.default({}),
  providerOptions: providerOptionsSchema.default({}),
};

export const subscriptionSchema = z
  .object({
    id: z.number().int().optional(),
    mode: z.enum(["inline", "provider"]),
    ...subscriptionFields,
  })
  .strict();

const providerSchema = z.object(subscriptionFields).strict();

export type SubscriptionInput = z.input<typeof subscriptionSchema>;
export type ProviderSubscriptionValues = Omit<z.output<typeof subscriptionSchema>, "id" | "mode">;

export const NEW_PROVIDER_TEMPLATE = `name: 我的订阅
url: https://example.com/sub
userAgent: clash.meta
enabled: true
# 仅 Node.js 部署使用内建 Cron 主动刷新
refreshInterval: 3600
providerOptions:
  interval: 3600
  healthCheck:
    enable: false
processing: {}
`;

export function parseProviderSubscription(
  text: string,
  pointers: YamlPointerDefinition[] = [],
): ProviderSubscriptionValues {
  const doc = parseDocument(text);
  if (doc.errors.length) throw new Error(`YAML 语法错误：${doc.errors[0].message}`);
  if (!isMap(doc.contents)) throw new Error("订阅配置必须是 YAML 映射");
  expandYamlPointers(doc, pointers);
  return providerSchema.parse(doc.toJS());
}

export function providerSubscriptionToYaml(subscription: Subscription | SubscriptionInput): string {
  return stringify({
    name: subscription.name,
    url: subscription.url,
    userAgent: subscription.userAgent ?? "clash.meta",
    enabled: subscription.enabled ?? true,
    refreshInterval: subscription.refreshInterval ?? 3600,
    providerOptions: subscription.providerOptions ?? {},
    processing: subscription.processing ?? {},
  });
}

export function formatSubscriptionConfigError(err: unknown): string {
  if (err instanceof ZodError) return err.issues.map((i) => `${i.path.join(".") || "配置"}：${i.message}`).join("；");
  return err instanceof Error ? err.message : String(err);
}
