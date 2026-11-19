// Pure helpers that read JSON Schema nodes for the schema-driven form builder (D18).
// Nodes are untyped JSON at runtime, so every accessor narrows with type guards.
import { readAnnotation } from "./annotations";
import type { EditorName, XHomeplan } from "./annotations";

export type SchemaNode = Readonly<Record<string, unknown>>;

export const isSchemaNode = (value: unknown): value is SchemaNode =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export type PropertyEntry = Readonly<{
  key: string;
  node: SchemaNode;
  required: boolean;
  annotation: XHomeplan;
}>;

export type Choice = Readonly<{ value: string; title: string }>;

const stringField = (node: SchemaNode, key: string): string | undefined => {
  const value = node[key];
  return typeof value === "string" ? value : undefined;
};

const numberField = (node: SchemaNode, key: string): number | undefined => {
  const value = node[key];
  return typeof value === "number" ? value : undefined;
};

export const schemaTitle = (node: SchemaNode, fallback: string): string =>
  stringField(node, "title") ?? fallback;

export const schemaDescription = (node: SchemaNode): string | undefined => stringField(node, "description");

export const schemaDefault = (node: SchemaNode): unknown => node.default;

export const isReadOnly = (node: SchemaNode): boolean => node.readOnly === true;

export const schemaType = (node: SchemaNode): string | undefined => {
  const type = node.type;
  if (typeof type === "string") return type;
  return undefined;
};

/** The properties of an object node, sorted by x-homeplan order (stable for equal orders). */
export const objectProperties = (node: SchemaNode): readonly PropertyEntry[] => {
  const properties = node.properties;
  if (!isSchemaNode(properties)) return [];
  const requiredList = Array.isArray(node.required)
    ? node.required.filter((entry) => typeof entry === "string")
    : [];
  const entries: PropertyEntry[] = [];
  for (const [key, child] of Object.entries(properties)) {
    if (!isSchemaNode(child)) continue;
    entries.push({
      key,
      node: child,
      required: requiredList.includes(key),
      annotation: readAnnotation(child),
    });
  }
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) => (a.entry.annotation.order ?? 1000) - (b.entry.annotation.order ?? 1000) || a.index - b.index,
    )
    .map(({ entry }) => entry);
};

/** Choices from anyOf/oneOf of {const, title}, or enum. */
export const choicesOf = (node: SchemaNode): readonly Choice[] => {
  const list = Array.isArray(node.anyOf) ? node.anyOf : Array.isArray(node.oneOf) ? node.oneOf : undefined;
  if (list !== undefined) {
    const choices: Choice[] = [];
    for (const option of list) {
      if (!isSchemaNode(option)) continue;
      const value = option.const;
      if (typeof value === "string") choices.push({ value, title: stringField(option, "title") ?? value });
    }
    return choices;
  }
  if (Array.isArray(node.enum)) {
    return node.enum.filter((entry) => typeof entry === "string").map((value) => ({ value, title: value }));
  }
  return [];
};

export const arrayItemsNode = (node: SchemaNode): SchemaNode | undefined => {
  const items = node.items;
  return isSchemaNode(items) ? items : undefined;
};

export type NumericLimits = Readonly<{
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  integer: boolean;
}>;

export const numericLimits = (node: SchemaNode): NumericLimits => ({
  minimum: numberField(node, "minimum"),
  maximum: numberField(node, "maximum"),
  exclusiveMinimum: numberField(node, "exclusiveMinimum"),
  exclusiveMaximum: numberField(node, "exclusiveMaximum"),
  integer: schemaType(node) === "integer",
});

/** Chooses the editor: the declared x-homeplan editor, otherwise a default from the schema type (property-system.md). */
export const resolveEditorName = (
  node: SchemaNode,
  annotation: XHomeplan,
): EditorName | "group" | undefined => {
  if (annotation.editor !== undefined) return annotation.editor;
  if (isReadOnly(node)) return "readOnly";
  if (choicesOf(node).length > 0) return "select";
  if (annotation.quantity === "length") return "length";
  if (annotation.quantity === "angle") return "angle";
  if (typeof node.contentMediaType === "string") return "file";
  const type = schemaType(node);
  if (type === "boolean") return "toggle";
  if (type === "number" || type === "integer") return "number";
  if (type === "string") return stringField(node, "format") === "date-time" ? "dateTime" : "text";
  if (type === "array") {
    const items = arrayItemsNode(node);
    return items !== undefined && choicesOf(items).length > 0 ? "multiSelect" : undefined;
  }
  if (type === "object" && isSchemaNode(node.properties)) return "group";
  return undefined;
};

/** Evaluates x-homeplan visibleWhen against the object that owns the property. */
export const isVisible = (annotation: XHomeplan, owner: unknown): boolean => {
  if (annotation.hidden === true) return false;
  const condition = annotation.visibleWhen;
  if (condition === undefined) return true;
  if (!isSchemaNode(owner)) return false;
  return owner[condition.property] === condition.equals;
};

/** Reads a nested value by path. */
export const valueAtPath = (value: unknown, path: readonly string[]): unknown => {
  let current: unknown = value;
  for (const key of path) {
    if (!isSchemaNode(current)) return undefined;
    current = current[key];
  }
  return current;
};

/** Returns a copy of value with the property at path replaced (objects only). */
export const withValueAtPath = (value: unknown, path: readonly string[], next: unknown): unknown => {
  if (path.length === 0) return next;
  const [head, ...rest] = path;
  if (head === undefined) return next;
  const base: Record<string, unknown> = isSchemaNode(value) ? { ...value } : {};
  base[head] = withValueAtPath(base[head], rest, next);
  return base;
};

export const pathToPointer = (path: readonly string[]): string =>
  path.length === 0 ? "" : `/${path.map((key) => key.replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`;

/** Fills missing properties from schema defaults (recursively for nested objects). */
export const applyDefaults = (node: SchemaNode, value: unknown): unknown => {
  if (schemaType(node) !== "object") return value === undefined ? schemaDefault(node) : value;
  const base: Record<string, unknown> = isSchemaNode(value) ? { ...value } : {};
  for (const entry of objectProperties(node)) {
    const current = base[entry.key];
    if (current === undefined) {
      const fallback = schemaDefault(entry.node);
      if (fallback !== undefined) base[entry.key] = structuredClone(fallback);
      else if (schemaType(entry.node) === "object" && entry.required)
        base[entry.key] = applyDefaults(entry.node, undefined);
    } else if (schemaType(entry.node) === "object") {
      base[entry.key] = applyDefaults(entry.node, current);
    }
  }
  return base;
};

export type SchemaGroup = Readonly<{ id: string; title: string }>;

export const schemaGroups = (node: SchemaNode): readonly SchemaGroup[] => readAnnotation(node).groups ?? [];
