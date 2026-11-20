// A texture's proposed material values (owner, 2026-11-20; spec/builder/features/materials-and-objects.md#proposed-texture-values):
// built-in textures carry them in code (./builtinMaterials), uploaded images in their images.json entry (`texture`).
// Choosing a texture in a material applies them; the material can be adjusted afterwards.
import type { ImageEntryValue, TextureHintsValue } from "../../contracts/images";
import { findBuiltInImage } from "../house/builtinMaterials";

export const textureHintsFor = (
  imageId: string,
  images: readonly ImageEntryValue[],
): TextureHintsValue | undefined => {
  const builtIn = findBuiltInImage(imageId);
  if (builtIn !== undefined)
    return {
      tileSizeMm: { x: builtIn.tileSizeMm, y: builtIn.tileSizeMm },
      roughness: builtIn.roughness,
      metallic: builtIn.metallic,
    };
  return images.find((image) => image.id === imageId)?.texture;
};

/** A repeat size that keeps the image's proportions: `widthMm` across, the height to match. */
export const proportionalTileSize = (
  widthMm: number,
  image: Readonly<{ widthPx: number; heightPx: number }>,
): Readonly<{ x: number; y: number }> => ({
  x: widthMm,
  y: Math.round((widthMm * image.heightPx) / Math.max(1, image.widthPx)),
});
