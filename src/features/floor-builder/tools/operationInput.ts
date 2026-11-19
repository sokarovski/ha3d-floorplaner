// Click–lock–type–commit (D16): after the first click an operation is locked to a direction; typing a value
// (any length unit, or degrees) overrides the pointer distance; Enter commits the typed value, a second click
// commits the pointer value, Escape cancels. toolPointer translates an initial drag/release into a commit.
import type { LengthUnit } from "@shared/domain/schemas/house";
import { parseAngle } from "@shared/domain/units/angles";
import { formatLength, parseLength } from "@shared/domain/units/lengthUnits";

export type ValueKind = "length" | "angle";

export type TypedValue = Readonly<{ text: string; kind: ValueKind }>;

export type KeyResult = Readonly<{ typed: string; action: "none" | "commit" | "cancel" | "consumed" }>;

const valueCharacter = /^[0-9.\-+a-zA-Z"'°\s]$/;

/** Feeds one key into the typed value buffer. */
export const feedKey = (typed: string, key: string): KeyResult => {
  if (key === "Enter") return { typed, action: "commit" };
  if (key === "Escape") return { typed: "", action: "cancel" };
  if (key === "Backspace") return { typed: typed.slice(0, -1), action: typed === "" ? "none" : "consumed" };
  // Letters (units such as m, ft) and spaces only continue a number already being typed; otherwise the key is
  // left for tool shortcuts (R, C, Space, ...).
  if (key.length === 1 && /[a-zA-Z\s]/.test(key) && !/[0-9]/.test(typed)) return { typed, action: "none" };
  if (key.length === 1 && valueCharacter.test(key)) return { typed: typed + key, action: "consumed" };
  return { typed, action: "none" };
};

export type ResolvedValue = Readonly<{ ok: true; value: number }> | Readonly<{ ok: false; message: string }>;

/** The typed value in canonical units (mm or degrees), if it parses. */
export const resolveTyped = (typed: string, kind: ValueKind, unit: LengthUnit): ResolvedValue => {
  if (kind === "angle") {
    const parsed = parseAngle(typed);
    return parsed.ok ? { ok: true, value: parsed.degrees } : { ok: false, message: parsed.message };
  }
  const parsed = parseLength(typed, unit);
  return parsed.ok
    ? { ok: true, value: parsed.millimeters }
    : { ok: false, message: "Type a length such as 3m, 250, or 12ft." };
};

/** The live readout text: the typed value when present, else the pointer value in the project unit. */
export const readout = (typed: string, pointerValue: number, kind: ValueKind, unit: LengthUnit): string => {
  if (typed.trim() !== "") {
    const resolved = resolveTyped(typed, kind, unit);
    return resolved.ok
      ? `${typed}  =  ${kind === "angle" ? `${resolved.value.toFixed(1)}°` : formatLength(resolved.value, unit)}`
      : `${typed}  (invalid)`;
  }
  return kind === "angle" ? `${pointerValue.toFixed(1)}°` : formatLength(pointerValue, unit);
};

/** The value to preview: a valid typed value wins over the pointer value. */
export const effectiveValue = (
  typed: string,
  pointerValue: number,
  kind: ValueKind,
  unit: LengthUnit,
): number => {
  if (typed.trim() === "") return pointerValue;
  const resolved = resolveTyped(typed, kind, unit);
  return resolved.ok ? resolved.value : pointerValue;
};
