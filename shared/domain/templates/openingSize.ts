// The stable opening-size resolver for the geometry core: an opening's size comes from its instance
// parameters (template defaults are copied on insertion, D07). Must stay one function identity (memoization).
import type { WallableInstanceValue } from "../schemas/instances";

export const openingSizeFromParameters = (
  opening: WallableInstanceValue,
): Readonly<{ widthMm: number; heightMm: number }> | null => {
  const width = opening.parameters.widthMm;
  const height = opening.parameters.heightMm;
  return typeof width === "number" && typeof height === "number" && width > 0 && height > 0
    ? { widthMm: width, heightMm: height }
    : null;
};
