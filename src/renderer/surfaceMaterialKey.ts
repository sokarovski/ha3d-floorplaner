// Content keys for surface materials: equal glTF material values share one Three.js material.
import type { SurfaceMaterialValue } from "@shared/domain/schemas/values";

export type TexturePlacementValue = NonNullable<SurfaceMaterialValue["extras"]>["homeplan"];

/** How strongly isolation fades a surface: other areas are dimmed, an editor's own walls/objects faded. */
export type FadeLevel = "normal" | "faded" | "dimmed";

/** Visual variant of a surface: a fade level; carpet variants pull forward in depth. */
export type SurfaceVariant = FadeLevel | "carpet" | "carpetFaded" | "carpetDimmed";

const fadeOpacity: Readonly<Record<FadeLevel, number>> = { normal: 1, faded: 0.25, dimmed: 0.1 };

export const fadeOfVariant = (variant: SurfaceVariant): FadeLevel =>
  variant === "carpet"
    ? "normal"
    : variant === "carpetFaded"
      ? "faded"
      : variant === "carpetDimmed"
        ? "dimmed"
        : variant;

export const isCarpetVariant = (variant: SurfaceVariant): boolean =>
  variant === "carpet" || variant === "carpetFaded" || variant === "carpetDimmed";

const fadeRank: Readonly<Record<FadeLevel, number>> = { normal: 0, faded: 1, dimmed: 2 };

/** The fainter of two fade levels (isolation dimming combined with a ghosted Show hidden item). */
export const strongerFade = (a: FadeLevel, b: FadeLevel): FadeLevel => (fadeRank[a] >= fadeRank[b] ? a : b);

/** Opacity multiplier of a fade level. */
export const opacityOfFade = (fade: FadeLevel): number => fadeOpacity[fade];

export const carpetVariant = (fade: FadeLevel): SurfaceVariant =>
  fade === "normal" ? "carpet" : fade === "faded" ? "carpetFaded" : "carpetDimmed";

const keyCache = new WeakMap<SurfaceMaterialValue, string>();

export const surfaceMaterialKey = (material: SurfaceMaterialValue, variant: SurfaceVariant): string => {
  const cached = keyCache.get(material);
  const base = cached ?? JSON.stringify(material);
  if (cached === undefined) keyCache.set(material, base);
  return `${variant}|${base}`;
};
