import { isMap, parseDocument } from "yaml";
import type { MihomoProxy } from "@/lib/types";
import { expandYamlPointers, type YamlPointerDefinition } from "@/lib/yaml-pointer";

export function parseManualNodeConfig(text: string, pointers: YamlPointerDefinition[] = []): MihomoProxy {
  const doc = parseDocument(text);
  if (doc.errors.length) throw new Error(`YAML 语法错误：${doc.errors[0].message}`);
  if (!isMap(doc.contents)) throw new Error("节点必须是包含 name 和 type 的 YAML 映射");
  expandYamlPointers(doc, pointers);
  const config = doc.toJS() as MihomoProxy;
  if (typeof config.name !== "string" || typeof config.type !== "string") {
    throw new Error("节点必须是包含 name 和 type 的 YAML 映射");
  }
  return config;
}
