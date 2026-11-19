// Material choices of a template's slots for the instance property panel (Phase 9.1,
// spec/builder/features/object-templates.md#material-choices): every slot marked `choosable` becomes one field of
// the instance's `materialOverrides`, edited by the `materialChoice` editor. Swatches come from the glTF materials
// bundled in the asset (base colour factor, linear → sRGB; whether a base colour texture is set).
import { hp } from "../schemas/annotations";
import type { XHomeplan } from "../schemas/annotations";
import { isSchemaNode } from "../schemas/schemaWalk";
import type { TemplateMetadata } from "./metadata";

export type MaterialSwatch = Readonly<{ color: readonly [number, number, number]; textured: boolean }>;

const toSrgb255 = (linear: unknown): number => {
  const value = typeof linear === "number" ? Math.min(1, Math.max(0, linear)) : 1;
  const srgb = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(srgb * 255);
};

/** Swatch per glTF material name, read from a glTF JSON document (`materials[]`). */
export const gltfMaterialSwatches = (gltf: unknown): Readonly<Record<string, MaterialSwatch>> => {
  const swatches: Record<string, MaterialSwatch> = {};
  if (!isSchemaNode(gltf) || !Array.isArray(gltf.materials)) return swatches;
  for (const material of gltf.materials) {
    if (!isSchemaNode(material) || typeof material.name !== "string") continue;
    const pbr = isSchemaNode(material.pbrMetallicRoughness) ? material.pbrMetallicRoughness : {};
    const factor: readonly unknown[] = Array.isArray(pbr.baseColorFactor) ? pbr.baseColorFactor : [];
    swatches[material.name] = {
      color: [toSrgb255(factor[0]), toSrgb255(factor[1]), toSrgb255(factor[2])],
      textured: pbr.baseColorTexture !== undefined,
    };
  }
  return swatches;
};

const neutralSwatch: MaterialSwatch = { color: [200, 200, 200], textured: false };

/**
 * The panel fields of a template's choosable slots: one schema node per slot (title = the slot's title, else
 * its name), offering the slot's own material first, then its other presets in order.
 */
export const templateMaterialChoiceSchemas = (
  metadata: TemplateMetadata,
  swatches: Readonly<Record<string, MaterialSwatch>>,
): Readonly<Record<string, object>> => {
  const fields: Record<string, object> = {};
  let order = 1;
  for (const [slot, value] of Object.entries(metadata.materialSlots)) {
    if (typeof value === "string" || value.choosable !== true) continue;
    const names = [value.material, ...(value.presets ?? []).filter((name) => name !== value.material)];
    const choice: NonNullable<XHomeplan["materialChoice"]> = {
      material: value.material,
      presets: names.map((name) => {
        const swatch = swatches[name] ?? neutralSwatch;
        return { name, color: [...swatch.color], textured: swatch.textured };
      }),
      allowColor: value.allowColor === true,
      allowTexture: value.allowTexture === true,
    };
    fields[slot] = {
      title: value.title ?? slot,
      ...hp({ editor: "materialChoice", order, materialChoice: choice }),
    };
    order += 1;
  }
  return fields;
};
