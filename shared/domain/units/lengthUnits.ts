// The one mixed-unit length parser, converter, and formatter (spec/builder/features/units-and-grid.md, D16).
// Canonical lengths are millimeters; display units never rescale stored geometry.
import type { LengthUnit } from "../schemas/house";

export const millimetersPerUnit: Readonly<Record<LengthUnit, number>> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  ft: 304.8,
};

/** Decimals that resolve about 0.1 mm in each unit (D16). */
export const displayDecimals: Readonly<Record<LengthUnit, number>> = { mm: 1, cm: 2, m: 4, in: 3, ft: 4 };

const unitAliases: Readonly<Record<string, LengthUnit>> = {
  mm: "mm",
  millimeter: "mm",
  millimeters: "mm",
  millimetre: "mm",
  millimetres: "mm",
  cm: "cm",
  centimeter: "cm",
  centimeters: "cm",
  centimetre: "cm",
  centimetres: "cm",
  m: "m",
  meter: "m",
  meters: "m",
  metre: "m",
  metres: "m",
  in: "in",
  inch: "in",
  inches: "in",
  '"': "in",
  ft: "ft",
  foot: "ft",
  feet: "ft",
  "'": "ft",
};

/** Removes floating-point noise below a nanometer from converted values. */
const cleanMillimeters = (value: number): number => Math.round(value * 1e6) / 1e6;

export type LengthParseResult =
  | Readonly<{ ok: true; millimeters: number; unit: LengthUnit; explicitUnit: boolean }>
  | Readonly<{ ok: false; reason: "empty" | "invalid" | "unknownUnit" }>;

const lengthPattern = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*([a-z"']*)$/;

/** Parses "1.5m", "150 cm", "2 in", "3ft", or a bare number in the project unit. */
export const parseLength = (text: string, projectUnit: LengthUnit): LengthParseResult => {
  const trimmed = text.trim().toLowerCase();
  if (trimmed === "") return { ok: false, reason: "empty" };
  const match = lengthPattern.exec(trimmed);
  if (match === null) return { ok: false, reason: "invalid" };
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return { ok: false, reason: "invalid" };
  const suffix = match[2] ?? "";
  if (suffix === "")
    return {
      ok: true,
      millimeters: cleanMillimeters(amount * millimetersPerUnit[projectUnit]),
      unit: projectUnit,
      explicitUnit: false,
    };
  const unit = unitAliases[suffix];
  if (unit === undefined) return { ok: false, reason: "unknownUnit" };
  return {
    ok: true,
    millimeters: cleanMillimeters(amount * millimetersPerUnit[unit]),
    unit,
    explicitUnit: true,
  };
};

/** Converts millimeters to the unit, rounded to the unit's display precision, trailing zeros trimmed. */
export const formatLengthNumber = (millimeters: number, unit: LengthUnit): string => {
  const value = millimeters / millimetersPerUnit[unit];
  const fixed = value.toFixed(displayDecimals[unit]);
  const trimmed = fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
  return trimmed === "-0" ? "0" : trimmed;
};

export const formatLength = (millimeters: number, unit: LengthUnit): string =>
  `${formatLengthNumber(millimeters, unit)} ${unit}`;

export const lengthParseMessage = (result: LengthParseResult): string | undefined =>
  result.ok
    ? undefined
    : result.reason === "empty"
      ? "Enter a length."
      : result.reason === "unknownUnit"
        ? "Unknown unit. Use mm, cm, m, in, or ft."
        : "Enter a number with an optional unit, e.g. 1.5m.";
