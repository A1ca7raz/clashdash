import { isMap, isSeq, parseDocument, stringify } from "yaml";
import { z, ZodError } from "zod";
import type { ProxyGroup } from "@/db/schema";
import { GROUP_TYPES, type GroupMembers, type GroupOptions, type GroupType } from "@/lib/types";
import { expandYamlPointers, type YamlPointerDefinition } from "@/lib/yaml-pointer";

const defaultSources = { all: true, subscriptions: [], manual: true };

const groupSchema = z
  .object({
    name: z.string().trim().min(1, "名称不能为空").regex(/^[^,]+$/, "名称不能包含逗号"),
    type: z.enum(GROUP_TYPES),
    options: z
      .object({
        url: z.string().optional(),
        interval: z.number().int().positive().optional(),
        tolerance: z.number().int().min(0).optional(),
        timeout: z.number().int().positive().optional(),
        lazy: z.boolean().optional(),
        strategy: z.enum(["consistent-hashing", "round-robin", "sticky-sessions"]).optional(),
        hidden: z.boolean().optional(),
        icon: z.string().optional(),
        disableUdp: z.boolean().optional(),
      })
      .strict()
      .default({}),
    members: z
      .object({
        items: z.array(z.string()).default([]),
        sources: z
          .object({
            all: z.boolean().default(true),
            subscriptions: z.array(z.string().trim().min(1, "订阅名称不能为空")).default([]),
            manual: z.boolean().default(true),
          })
          .strict()
          .default(defaultSources),
        include: z.string().optional(),
        exclude: z.string().optional(),
      })
      .strict()
      .default({ items: [], sources: defaultSources }),
  })
  .strict();

export interface GroupConfigValues {
  name: string;
  type: GroupType;
  options: GroupOptions;
  members: Omit<GroupMembers, "sources"> & {
    sources: Omit<GroupMembers["sources"], "subscriptions"> & { subscriptions: string[] };
  };
}

export const NEW_GROUP_TEMPLATE = `name: 节点选择
type: select
options: {}
members:
  items: []
  sources:
    all: true
    subscriptions: []
    manual: true
`;

export function parseGroupConfig(text: string, pointers: YamlPointerDefinition[] = []): GroupConfigValues {
  const doc = parseDocument(text);
  if (doc.errors.length) throw new Error(`YAML 语法错误：${doc.errors[0].message}`);
  if (!isMap(doc.contents)) throw new Error("代理组配置必须是 YAML 映射");
  expandYamlPointers(doc, pointers);
  return groupSchema.parse(doc.toJS());
}

function updateStringSequence(
  yaml: string,
  path: (string | number)[],
  update: (value: string) => string | null | undefined,
): string {
  const doc = parseDocument(yaml);
  const sequence = doc.getIn(path);
  if (!isSeq(sequence)) return yaml;
  for (let i = 0; i < sequence.items.length; ) {
    const value = doc.getIn([...path, i]);
    if (typeof value !== "string") {
      i++;
      continue;
    }
    const next = update(value);
    if (next === null) {
      sequence.items.splice(i, 1);
      continue;
    }
    if (next !== undefined && next !== value) doc.setIn([...path, i], next);
    i++;
  }
  return doc.toString({ verifyAliasOrder: false });
}

export function updateGroupItemsYaml(yaml: string, from: string, to: string): string {
  return updateStringSequence(yaml, ["members", "items"], (value) => (value === from ? to : undefined));
}

export function removeGroupSubscriptionsYaml(yaml: string, names: string[]): string {
  const removed = new Set(names);
  return updateStringSequence(yaml, ["members", "sources", "subscriptions"], (value) =>
    removed.has(value) ? null : undefined,
  );
}

export function renameGroupSubscriptionYaml(yaml: string, from: string, to: string): string {
  return updateStringSequence(yaml, ["members", "sources", "subscriptions"], (value) => (value === from ? to : undefined));
}

export function groupToYaml(group: ProxyGroup, subscriptions: { id: number; name: string }[]): string {
  const names = new Map(subscriptions.map((s) => [s.id, s.name]));
  return stringify({
    name: group.name,
    type: group.type,
    options: group.options,
    members: {
      ...group.members,
      sources: {
        ...group.members.sources,
        subscriptions: group.members.sources.subscriptions.map((id) => names.get(id) ?? `#${id}`),
      },
    },
  });
}

export function formatGroupConfigError(err: unknown): string {
  if (err instanceof ZodError) return err.issues.map((i) => `${i.path.join(".") || "配置"}：${i.message}`).join("；");
  return err instanceof Error ? err.message : String(err);
}
