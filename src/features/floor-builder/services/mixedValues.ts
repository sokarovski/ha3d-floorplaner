// Multi-selection: JSON Pointers whose values differ across the selected objects (shown as Mixed).
import { isSchemaNode } from "@shared/domain/schemas/schemaWalk";

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export const mixedPointers = (values: readonly unknown[], pointer = ""): ReadonlySet<string> => {
  const result = new Set<string>();
  const first = values[0];
  if (values.length < 2) return result;
  if (values.every((value) => sameJson(value, first))) return result;
  result.add(pointer);
  if (values.every((value) => isSchemaNode(value))) {
    const keys = new Set(values.flatMap((value) => (isSchemaNode(value) ? Object.keys(value) : [])));
    for (const key of keys) {
      for (const nested of mixedPointers(
        values.map((value) => (isSchemaNode(value) ? value[key] : undefined)),
        `${pointer}/${key}`,
      ))
        result.add(nested);
    }
  }
  return result;
};
