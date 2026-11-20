// A flat, editable view of a glTF surface material for the material editor (D19): tint in sRGB 0–255,
// Shininess = 1 − roughness, placement in mm. Converts losslessly enough back to the stored glTF fields.
import Type from "typebox";
import type { Static } from "typebox";
import { hp } from "../schemas/annotations";
import type { SurfaceMaterialValue } from "../schemas/values";
import { Vector2Length } from "../schemas/values";

const toSrgbChannel = (linear: number): number => {
  const clamped = Math.min(1, Math.max(0, linear));
  const srgb = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(srgb * 255);
};

const toLinearChannel = (srgb255: number): number => {
  const c = Math.min(255, Math.max(0, srgb255)) / 255;
  const linear = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return Math.round(linear * 1e6) / 1e6;
};

const colorFields = {
  tint: Type.Array(Type.Integer({ minimum: 0, maximum: 255 }), {
    minItems: 3,
    maxItems: 3,
    title: "Color / tint",
    ...hp({ editor: "color", order: 2 }),
  }),
  roughness: Type.Number({
    title: "Shininess",
    minimum: 0,
    maximum: 1,
    ...hp({ editor: "slider", inverted: true, step: 0.01, order: 3 }),
  }),
  metallic: Type.Number({
    title: "Metallic",
    minimum: 0,
    maximum: 1,
    ...hp({ editor: "slider", step: 0.01, order: 4 }),
  }),
};

export const MaterialView = Type.Object(
  {
    image: Type.Optional(Type.String({ title: "Texture", ...hp({ editor: "image", order: 1 }) })),
    ...colorFields,
    tileSizeMm: Vector2Length({ title: "Tile size", order: 5 }),
    // A slider over a full turn (owner, 2026-11-20); stored angles outside 0–360 are shown as their equivalent.
    rotationDeg: Type.Number({
      title: "Texture rotation",
      minimum: 0,
      maximum: 360,
      ...hp({ editor: "slider", step: 1, quantity: "angle", order: 6 }),
    }),
    offsetMm: Vector2Length({ title: "Texture offset", order: 7 }),
  },
  { additionalProperties: false },
);

/**
 * The colour-only part of the view (Phase 9.1): a template slot that allows a plain colour but not a texture
 * shows these fields. Its values are a subset of MaterialView's, so the same conversions apply.
 */
export const MaterialColorView = Type.Object(colorFields, { additionalProperties: true });

export type MaterialViewValue = Static<typeof MaterialView>;

export const toMaterialView = (material: SurfaceMaterialValue): MaterialViewValue => {
  const pbr = material.pbrMetallicRoughness;
  const placement = material.extras?.homeplan;
  return {
    ...(pbr.baseColorTexture === undefined ? {} : { image: pbr.baseColorTexture.imageId }),
    tint: [
      toSrgbChannel(pbr.baseColorFactor[0] ?? 1),
      toSrgbChannel(pbr.baseColorFactor[1] ?? 1),
      toSrgbChannel(pbr.baseColorFactor[2] ?? 1),
    ],
    roughness: pbr.roughnessFactor,
    metallic: pbr.metallicFactor,
    tileSizeMm: placement?.tileSizeMm ?? { x: 1000, y: 1000 },
    rotationDeg: (((placement?.rotationDeg ?? 0) % 360) + 360) % 360,
    offsetMm: placement?.offsetMm ?? { x: 0, y: 0 },
  };
};

export const fromMaterialView = (
  view: MaterialViewValue,
  previous: SurfaceMaterialValue,
): SurfaceMaterialValue => ({
  pbrMetallicRoughness: {
    ...(view.image === undefined || view.image === "" ? {} : { baseColorTexture: { imageId: view.image } }),
    baseColorFactor: [
      toLinearChannel(view.tint[0] ?? 255),
      toLinearChannel(view.tint[1] ?? 255),
      toLinearChannel(view.tint[2] ?? 255),
      previous.pbrMetallicRoughness.baseColorFactor[3] ?? 1,
    ],
    roughnessFactor: view.roughness,
    metallicFactor: view.metallic,
  },
  extras: {
    homeplan: { tileSizeMm: view.tileSizeMm, rotationDeg: view.rotationDeg, offsetMm: view.offsetMm },
  },
});

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Every image ID referenced anywhere in a value (for reference checks). */
export const referencedImageIds = (value: unknown, found: Set<string> = new Set()): Set<string> => {
  if (Array.isArray(value)) {
    value.forEach((item: unknown) => {
      referencedImageIds(item, found);
    });
  } else if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (key === "baseColorTexture" && isRecord(child) && typeof child.imageId === "string")
        found.add(child.imageId);
      else referencedImageIds(child, found);
    }
  }
  return found;
};
