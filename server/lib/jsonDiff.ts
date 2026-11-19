// Structured JSON diff: a list of JSON Pointer changes from `before` to `after`.
// Objects compare by key; arrays compare by index, with trailing items added or removed.
import type { JsonChangeValue } from "../../shared/contracts/revisions";
import { isRecord, pointerToken } from "./json";

export const maxJsonChanges = 2000;

export const jsonChanges = (
  before: unknown,
  after: unknown,
): { changes: readonly JsonChangeValue[]; truncated: boolean } => {
  const changes: JsonChangeValue[] = [];
  let truncated = false;
  const push = (change: JsonChangeValue): void => {
    if (changes.length >= maxJsonChanges) truncated = true;
    else changes.push(change);
  };
  const visit = (pointer: string, a: unknown, b: unknown): void => {
    if (truncated) return;
    if (isRecord(a) && isRecord(b)) {
      for (const key of Object.keys(a)) {
        const child = `${pointer}/${pointerToken(key)}`;
        if (Object.hasOwn(b, key)) visit(child, a[key], b[key]);
        else push({ pointer: child, kind: "removed", before: a[key] });
      }
      for (const key of Object.keys(b)) {
        if (!Object.hasOwn(a, key))
          push({ pointer: `${pointer}/${pointerToken(key)}`, kind: "added", after: b[key] });
      }
      return;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      const common = Math.min(a.length, b.length);
      for (let index = 0; index < common; index += 1) visit(`${pointer}/${index}`, a[index], b[index]);
      for (let index = common; index < a.length; index += 1)
        push({ pointer: `${pointer}/${index}`, kind: "removed", before: a[index] });
      for (let index = common; index < b.length; index += 1)
        push({ pointer: `${pointer}/${index}`, kind: "added", after: b[index] });
      return;
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) push({ pointer, kind: "changed", before: a, after: b });
  };
  visit("", before, after);
  return { changes, truncated };
};
