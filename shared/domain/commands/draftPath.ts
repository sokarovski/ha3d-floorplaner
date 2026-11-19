// Generic access into an Immer draft by property path (used by setProperty).
import type { DocumentPath } from "../house/entityIndex";

type MutableRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is MutableRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Resolves an entity path (keys and array indexes) inside a draft. */
export const resolveDraftPath = (root: unknown, path: DocumentPath): unknown => {
  let current: unknown = root;
  for (const key of path) {
    if (typeof key === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[key];
    } else {
      if (!isRecord(current)) return undefined;
      current = current[key];
    }
  }
  return current;
};

/**
 * Sets a value at a property path below an object, creating intermediate objects; `undefined` removes the
 * property (a material choice back to the template's own material, Phase 9.1). Returns false if impossible.
 */
export const setAtPropertyPath = (target: unknown, path: readonly string[], value: unknown): boolean => {
  if (!isRecord(target) || path.length === 0) return false;
  const [head, ...rest] = path;
  if (head === undefined) return false;
  if (rest.length === 0) {
    if (value === undefined) Reflect.deleteProperty(target, head);
    else target[head] = structuredClone(value);
    return true;
  }
  if (!isRecord(target[head])) target[head] = {};
  return setAtPropertyPath(target[head], rest, value);
};

export const readAtPropertyPath = (target: unknown, path: readonly string[]): unknown => {
  let current: unknown = target;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
};
