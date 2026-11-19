// Human-readable limit checks for numeric editors, with lengths shown in the project unit.
import type { LengthUnit } from "@shared/domain/schemas/house";
import type { NumericLimits } from "@shared/domain/schemas/schemaWalk";
import { formatLength } from "@shared/domain/units/lengthUnits";

export const checkLimits = (
  value: number,
  limits: NumericLimits,
  format: (value: number) => string,
): string | undefined => {
  if (limits.minimum !== undefined && value < limits.minimum)
    return `Must be at least ${format(limits.minimum)}.`;
  if (limits.exclusiveMinimum !== undefined && value <= limits.exclusiveMinimum)
    return `Must be more than ${format(limits.exclusiveMinimum)}.`;
  if (limits.maximum !== undefined && value > limits.maximum)
    return `Must be at most ${format(limits.maximum)}.`;
  if (limits.exclusiveMaximum !== undefined && value >= limits.exclusiveMaximum)
    return `Must be less than ${format(limits.exclusiveMaximum)}.`;
  if (limits.integer && !Number.isInteger(value)) return "Must be a whole number.";
  return undefined;
};

export const lengthFormatter =
  (unit: LengthUnit) =>
  (millimeters: number): string =>
    formatLength(millimeters, unit);
