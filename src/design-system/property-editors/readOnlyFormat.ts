// Display formatting for read-only and derived values.
import type { XHomeplan } from "@shared/domain/schemas/annotations";
import type { LengthUnit } from "@shared/domain/schemas/house";
import { choicesOf } from "@shared/domain/schemas/schemaWalk";
import type { SchemaNode } from "@shared/domain/schemas/schemaWalk";
import { formatDegrees } from "@shared/domain/units/angles";
import { formatLength } from "@shared/domain/units/lengthUnits";
import { formatPlainNumber } from "@shared/domain/units/numbers";

export const formatReadOnlyValue = (
  value: unknown,
  schema: SchemaNode,
  annotation: XHomeplan,
  unit: LengthUnit,
): string => {
  if (value === undefined || value === null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (annotation.quantity === "length") return formatLength(value, unit);
    if (annotation.quantity === "angle") return `${formatDegrees(value)}°`;
    return annotation.unitSuffix === undefined
      ? formatPlainNumber(value)
      : `${formatPlainNumber(value)} ${annotation.unitSuffix}`;
  }
  if (typeof value === "string")
    return choicesOf(schema).find((choice) => choice.value === value)?.title ?? value;
  return JSON.stringify(value);
};
