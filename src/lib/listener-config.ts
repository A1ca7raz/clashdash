import { isMap, parseDocument, stringify } from "yaml";
import { z, ZodError } from "zod";
import type { Listener } from "@/db/schema";
import { LISTENER_TYPES, type ListenerType } from "@/lib/types";
import { expandYamlPointers, type YamlPointerDefinition } from "@/lib/yaml-pointer";

const MANAGED_FIELDS = new Set(["name", "type", "listen", "port", "proxy", "rule"]);

const listenerSchema = z
  .object({
    name: z.string().trim().min(1, "名称不能为空"),
    type: z.enum(LISTENER_TYPES),
    listen: z.string().trim().default("0.0.0.0"),
    port: z.number().int().min(1).max(65535).nullable().default(null),
    proxy: z.string().trim().min(1).nullable().default(null),
    rule: z.string().trim().min(1).nullable().default(null),
  })
  .passthrough()
  .refine((v) => !(v.proxy && v.rule), { message: "代理和子规则只能选一个", path: ["proxy"] })
  .refine((v) => v.type === "tun" || v.port !== null, { message: "端口不能为空", path: ["port"] });

export interface ListenerConfigValues {
  name: string;
  type: ListenerType;
  listen: string;
  port: number | null;
  proxy: string | null;
  subRule: string | null;
  options: Record<string, unknown>;
}

export const NEW_LISTENER_TEMPLATE = `name: 我的监听器
type: mixed
listen: 0.0.0.0
port: 7891
udp: true
`;

export function parseListenerConfig(text: string, pointers: YamlPointerDefinition[] = []): ListenerConfigValues {
  const doc = parseDocument(text);
  if (doc.errors.length) throw new Error(`YAML 语法错误：${doc.errors[0].message}`);
  if (!isMap(doc.contents)) throw new Error("监听器配置必须是 YAML 映射");
  expandYamlPointers(doc, pointers);
  const { name, type, listen, port, proxy, rule, ...options } = listenerSchema.parse(doc.toJS());
  return { name, type, listen, port: type === "tun" ? null : port, proxy, subRule: rule, options };
}

export function updateListenerYaml(
  yaml: string,
  values: { name?: string; proxy?: string | null; subRule?: string | null },
): string {
  const doc = parseDocument(yaml);
  if (values.name !== undefined) doc.set("name", values.name);
  if (values.proxy !== undefined) doc.set("proxy", values.proxy);
  if (values.subRule !== undefined) doc.set("rule", values.subRule);
  return doc.toString({ verifyAliasOrder: false });
}

export function listenerToYaml(listener: Listener): string {
  const options = Object.fromEntries(Object.entries(listener.options).filter(([key]) => !MANAGED_FIELDS.has(key)));
  return stringify({
    name: listener.name,
    type: listener.type,
    ...(listener.type !== "tun" ? { listen: listener.listen, port: listener.port } : {}),
    ...(listener.proxy ? { proxy: listener.proxy } : {}),
    ...(listener.subRule ? { rule: listener.subRule } : {}),
    ...options,
  });
}

export function formatListenerConfigError(err: unknown): string {
  if (err instanceof ZodError) return err.issues.map((i) => `${i.path.join(".") || "配置"}：${i.message}`).join("；");
  return err instanceof Error ? err.message : String(err);
}
