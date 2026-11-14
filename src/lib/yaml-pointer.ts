import { isPair, isScalar, parseDocument, stringify, visit, type Document, type Node } from "yaml";

export interface YamlPointerDefinition {
  name: string;
  value: string;
}

function parsedDocument(text: string): Document {
  const doc = parseDocument(text);
  if (doc.errors.length) throw doc.errors[0];
  return doc;
}

function copyAliasComment(alias: Node, replacement: Node): void {
  if (alias.comment != null) replacement.comment = alias.comment;
  if (alias.commentBefore != null) replacement.commentBefore = alias.commentBefore;
  if (alias.spaceBefore != null) replacement.spaceBefore = alias.spaceBefore;
}

export function expandYamlPointers(doc: Document, pointers: readonly YamlPointerDefinition[]): void {
  const globals = new Map(pointers.map((pointer) => [pointer.name, pointer.value]));
  visit(doc, {
    Alias(_key, alias, path) {
      const local = alias.resolve(doc);
      if (local) {
        if (path.includes(local)) throw new Error(`Circular YAML alias: ${alias.source}`);
        const replacement = local.clone(doc.schema) as Node;
        copyAliasComment(alias, replacement);
        return replacement;
      }
      const parent = path[path.length - 1];
      const key = isPair(parent) ? parent.key : null;
      if (key !== "password" && (!isScalar(key) || key.value !== "password")) {
        throw new Error(`全局 YAML 密码指针「${alias.source}」只能作为 password 字段的值`);
      }
      if (!globals.has(alias.source)) throw new Error(`Unknown YAML pointer: ${alias.source}`);
      const replacement = doc.createNode(globals.get(alias.source)!, { aliasDuplicateObjects: false });
      copyAliasComment(alias, replacement);
      return replacement;
    },
  });
  visit(doc, {
    Value(_key, node) {
      node.anchor = undefined;
    },
  });
}

export function parseYamlPointerValue(text: string): string {
  const doc = parsedDocument(text);
  expandYamlPointers(doc, []);
  const value: unknown = doc.toJS();
  if (typeof value !== "string") throw new Error("密码指针值必须是 YAML 字符串");
  return value;
}

export function yamlPointerReferences(text: string): string[] {
  const doc = parsedDocument(text);
  const references = new Set<string>();
  visit(doc, {
    Alias(_key, alias) {
      if (!alias.resolve(doc)) references.add(alias.source);
    },
  });
  return [...references];
}

export function materializeYamlPointer(text: string, name: string, value: string): string {
  const doc = parsedDocument(text);
  visit(doc, {
    Alias(_key, alias) {
      if (alias.source !== name || alias.resolve(doc)) return;
      const replacement = doc.createNode(value, { aliasDuplicateObjects: false });
      copyAliasComment(alias, replacement);
      return replacement;
    },
  });
  return doc.toString({ verifyAliasOrder: false });
}

export function yamlPointerToString(value: string): string {
  return stringify(value, { aliasDuplicateObjects: false });
}
