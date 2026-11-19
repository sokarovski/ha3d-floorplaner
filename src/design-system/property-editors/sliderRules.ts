// Slider range and the optional inverted display (Shininess = 1 − roughness).
import type { XHomeplan } from "@shared/domain/schemas/annotations";
import type { NumericLimits } from "@shared/domain/schemas/schemaWalk";

export type SliderRange = Readonly<{ minimum: number; maximum: number; step: number }>;

export const sliderRange = (limits: NumericLimits, annotation: XHomeplan): SliderRange => {
  const minimum = limits.minimum ?? limits.exclusiveMinimum ?? 0;
  const maximum = limits.maximum ?? limits.exclusiveMaximum ?? 1;
  const step = annotation.step ?? (limits.integer ? 1 : maximum - minimum <= 1 ? 0.01 : 1);
  return { minimum, maximum, step };
};

export const toDisplayed = (stored: number, inverted: boolean, range: SliderRange): number =>
  inverted ? range.maximum + range.minimum - stored : stored;

export const toStored = (displayed: number, inverted: boolean, range: SliderRange): number =>
  inverted ? range.maximum + range.minimum - displayed : displayed;
