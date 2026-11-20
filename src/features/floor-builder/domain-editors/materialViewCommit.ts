// One field of the material form committed to a material (the material editor and the material chooser's preview
// share it): the flat view's change converted back to the glTF material. A newly chosen texture brings its proposed
// tile size, Shininess and metallic (owner, 2026-11-20), and an untextured surface's tint resets so it does not
// colour the new texture.
import type { ImageEntryValue } from "@shared/contracts/images";
import { fromMaterialView, MaterialView, toMaterialView } from "@shared/domain/materials/materialView";
import { textureHintsFor } from "@shared/domain/materials/textureHints";
import { isSchemaNode, withValueAtPath } from "@shared/domain/schemas/schemaWalk";
import type { SurfaceMaterialValue } from "@shared/domain/schemas/values";
import { compileValidator } from "@shared/domain/validation/ajv";

const isView = compileValidator(MaterialView);

/** The material after one form commit, or undefined when the change is not valid. */
export const materialAfterCommit = (
  material: SurfaceMaterialValue,
  path: readonly string[],
  next: unknown,
  images: readonly ImageEntryValue[],
): SurfaceMaterialValue | undefined => {
  const view = toMaterialView(material);
  const changed = withValueAtPath(view, path, next);
  const hints =
    path.length === 1 && path[0] === "image" && typeof next === "string" && next !== view.image
      ? textureHintsFor(next, images)
      : undefined;
  const updated =
    hints === undefined || !isSchemaNode(changed)
      ? changed
      : {
          ...changed,
          tileSizeMm: hints.tileSizeMm,
          roughness: hints.roughness,
          metallic: hints.metallic,
          ...(view.image === undefined ? { tint: [255, 255, 255] } : {}),
        };
  return isSchemaNode(updated) && isView(updated) ? fromMaterialView(updated, material) : undefined;
};
