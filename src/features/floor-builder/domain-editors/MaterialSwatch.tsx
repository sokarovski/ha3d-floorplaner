import type { ReactElement } from "react";
import { materialHex } from "@shared/domain/materials/materialLibrary";
import type { SurfaceMaterialValue } from "@shared/domain/schemas/values";
import { useDomainEditorData } from "./domainEditorData";

type MaterialSwatchProps = Readonly<{
  material: SurfaceMaterialValue;
  /** How much surface the swatch stands for (mm across), so a texture repeats at its real tile size. */
  spanMm: number;
  size: "tile" | "preview";
}>;

/**
 * A material as a square swatch (the material chooser): its texture repeated at its tile size over `spanMm`, turned
 * by its rotation and tinted by its colour, or the flat colour; shinier materials get a soft highlight.
 */
export const MaterialSwatch = ({ material, spanMm, size }: MaterialSwatchProps): ReactElement => {
  const data = useDomainEditorData();
  const texture = material.pbrMetallicRoughness.baseColorTexture;
  const tile = material.extras?.homeplan.tileSizeMm;
  const repeatX = tile === undefined || tile.x <= 0 ? 100 : Math.min(100, (tile.x / spanMm) * 100);
  const repeatY = tile === undefined || tile.y <= 0 ? 100 : Math.min(100, (tile.y / spanMm) * 100);
  const shine = 1 - material.pbrMetallicRoughness.roughnessFactor;
  // glTF's texture rotation turns the image counter-clockwise on the surface.
  const rotation = -(material.extras?.homeplan.rotationDeg ?? 0);
  return (
    <span
      aria-hidden="true"
      data-material-swatch=""
      data-material-swatch-preview={size === "preview" ? "" : undefined}
      data-material-swatch-textured={texture === undefined ? undefined : ""}
      ref={(element) => {
        if (element === null) return;
        element.style.setProperty("--swatch-color", materialHex(material));
        element.style.setProperty("--swatch-shine", String(Math.round(shine * 40) / 100));
        if (texture === undefined) {
          element.style.removeProperty("--swatch-image");
          return;
        }
        element.style.setProperty("--swatch-image", `url("${data.thumbnailUrl(texture.imageId)}")`);
        // The texture layer is twice the swatch's size (so a turned texture still covers it): half the repeat.
        element.style.setProperty("--swatch-repeat", `${String(repeatX / 2)}% ${String(repeatY / 2)}%`);
        element.style.setProperty("--swatch-rotation", `${String(rotation)}deg`);
      }}
    />
  );
};
