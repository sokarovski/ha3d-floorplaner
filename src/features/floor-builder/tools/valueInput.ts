// A typed-value buffer shared by tools: feeds keys, resolves the value, renders the readout.
import type { LengthUnit } from "@shared/domain/schemas/house";
import { effectiveValue, feedKey, readout } from "./operationInput";
import type { ValueKind } from "./operationInput";

export type ValueInput = {
  typed: string;
  readonly kind: ValueKind;
};

export const createValueInput = (kind: ValueKind): ValueInput => ({ typed: "", kind });

/** "commit" | "cancel" | "consumed" | "none" */
export const feedValueKey = (input: ValueInput, key: string): "commit" | "cancel" | "consumed" | "none" => {
  const result = feedKey(input.typed, key);
  input.typed = result.typed;
  return result.action;
};

export const valueOf = (input: ValueInput, pointerValue: number, unit: LengthUnit): number =>
  effectiveValue(input.typed, pointerValue, input.kind, unit);

export const readoutOf = (input: ValueInput, pointerValue: number, unit: LengthUnit): string =>
  readout(input.typed, pointerValue, input.kind, unit);

export const hasTyped = (input: ValueInput): boolean => input.typed.trim() !== "";
