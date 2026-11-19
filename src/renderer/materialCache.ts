// glTF surface materials (D19) → MeshStandardMaterial, shared by content key and swept per scene sync.
// baseColorFactor is linear RGBA (glTF), which is Three.js's working color space; images are sRGB.
//
// Never black (Phase 15.1): a material gets its image map only once the texture cache reports the image ready. Before,
// the map was set at once and sampled an empty texture, which WebGL draws black, until the image arrived. Until then
// the material draws its base colour tinted by the image's average colour when it is known (remembered from an earlier
// visit), and the map replaces it when ready. A host may prepare the map's shader first (`beforeMap`, the HA viewer
// compiles it in the background) so the swap costs no frame.
import { Color, FrontSide, MeshStandardMaterial, SRGBColorSpace } from "three";
import type { Texture } from "three";
import type { SurfaceMaterialValue } from "@shared/domain/schemas/values";
import type { SurfaceVariant } from "./surfaceMaterialKey";
import { fadeOfVariant, isCarpetVariant, opacityOfFade, surfaceMaterialKey } from "./surfaceMaterialKey";
import type { TextureCache } from "./textureCache";

type Entry = {
  readonly material: MeshStandardMaterial;
  readonly imageId: string | null;
  /** The image texture, kept while textures are turned off so turning them on again is instant. */
  readonly texture: Texture | null;
  /** The authored base colour (linear), restored when the map replaces the swatch tint. */
  readonly color: Color;
  /** The map is on the material (the image is ready and textures are enabled). */
  mapped: boolean;
  /** A `beforeMap` preparation is running. */
  preparing: boolean;
  disposed: boolean;
  generation: number;
};

export type MaterialCacheOptions = Readonly<{
  /**
   * Runs before a ready image's map goes onto a material (the HA viewer compiles the mapped shader in the background);
   * the map is applied when it resolves. Absent: at once.
   */
  beforeMap?: (material: MeshStandardMaterial, map: Texture) => Promise<void>;
  /** After a map went onto a material (a frame is needed). */
  onMapped?: () => void;
}>;

export type MaterialCache = Readonly<{
  /** Starts a sync pass; materials not requested before sweep() are disposed. */
  begin: () => void;
  get: (material: SurfaceMaterialValue, variant: SurfaceVariant) => MeshStandardMaterial;
  sweep: () => void;
  /**
   * Shows or hides image textures on every surface material (owner, Phase 5 follow-up: the Room Editor
   * draws on plain colours). Off keeps each material's base colour.
   */
  setTexturesEnabled: (enabled: boolean) => void;
  dispose: () => void;
}>;

export const createMaterialCache = (
  textures: TextureCache,
  options: MaterialCacheOptions = {},
): MaterialCache => {
  const entries = new Map<string, Entry>();
  let generation = 0;
  let texturesEnabled = true;

  /** The base colour while the map is off: tinted by the image's average colour when known. */
  const unmappedColor = (entry: Entry): Color => {
    const swatch = entry.imageId === null ? null : textures.swatch(entry.imageId);
    if (swatch === null || !texturesEnabled) return entry.color;
    return new Color().setRGB(swatch[0], swatch[1], swatch[2], SRGBColorSpace).multiply(entry.color);
  };

  const setMapped = (entry: Entry, mapped: boolean): void => {
    if (entry.disposed) return;
    const material = entry.material;
    if (mapped === entry.mapped) {
      if (!mapped) material.color.copy(unmappedColor(entry));
      return;
    }
    entry.mapped = mapped;
    material.map = mapped ? entry.texture : null;
    material.color.copy(mapped ? entry.color : unmappedColor(entry));
    material.needsUpdate = true;
  };

  /** Puts the map on when its image is ready (after `beforeMap`), or keeps the tinted base colour meanwhile. */
  const refresh = (entry: Entry): void => {
    const texture = entry.texture;
    if (!texturesEnabled || texture === null || entry.imageId === null || !textures.ready(entry.imageId)) {
      setMapped(entry, false);
      return;
    }
    if (entry.mapped || entry.preparing) return;
    const prepare = options.beforeMap;
    if (prepare === undefined) {
      setMapped(entry, true);
      options.onMapped?.();
      return;
    }
    entry.preparing = true;
    const apply = (): void => {
      entry.preparing = false;
      if (entry.disposed) return;
      setMapped(entry, texturesEnabled);
      options.onMapped?.();
    };
    prepare(entry.material, texture).then(apply, apply);
  };

  const unsubscribe = textures.subscribe((imageId) => {
    for (const entry of entries.values()) if (entry.imageId === imageId) refresh(entry);
  });

  const create = (value: SurfaceMaterialValue, variant: SurfaceVariant): Entry => {
    const pbr = value.pbrMetallicRoughness;
    const [r = 1, g = 1, b = 1, a = 1] = pbr.baseColorFactor;
    const opacity = a * opacityOfFade(fadeOfVariant(variant));
    const carpet = isCarpetVariant(variant);
    const imageId = pbr.baseColorTexture?.imageId ?? null;
    const material = new MeshStandardMaterial({
      color: new Color(r, g, b),
      roughness: pbr.roughnessFactor,
      metalness: pbr.metallicFactor,
      opacity,
      transparent: opacity < 1,
      depthWrite: opacity >= 1,
      side: FrontSide,
      polygonOffset: carpet,
      polygonOffsetFactor: carpet ? -1 : 0,
      polygonOffsetUnits: carpet ? -4 : 0,
    });
    const texture = imageId === null ? null : textures.acquire(imageId, value.extras?.homeplan);
    const entry: Entry = {
      material,
      imageId,
      texture,
      color: material.color.clone(),
      mapped: false,
      preparing: false,
      disposed: false,
      generation,
    };
    material.color.copy(unmappedColor(entry));
    // A ready image maps at once: the shader is compiled with the material's first use anyway.
    if (texturesEnabled && texture !== null && imageId !== null && textures.ready(imageId)) {
      entry.mapped = true;
      material.map = texture;
      material.color.copy(entry.color);
    }
    return entry;
  };

  const release = (entry: Entry): void => {
    entry.disposed = true;
    if (entry.imageId !== null && entry.texture !== null) textures.release(entry.imageId, entry.texture);
    entry.material.dispose();
  };

  return {
    begin: () => {
      generation += 1;
    },
    get: (value, variant) => {
      const key = surfaceMaterialKey(value, variant);
      const existing = entries.get(key);
      if (existing !== undefined) {
        existing.generation = generation;
        return existing.material;
      }
      const entry = create(value, variant);
      entries.set(key, entry);
      return entry.material;
    },
    sweep: () => {
      for (const [key, entry] of entries) {
        if (entry.generation === generation) continue;
        release(entry);
        entries.delete(key);
      }
    },
    setTexturesEnabled: (enabled) => {
      if (enabled === texturesEnabled) return;
      texturesEnabled = enabled;
      for (const entry of entries.values()) {
        if (entry.texture === null) continue;
        // Turning textures on again is instant for ready images (no preparation: the shader was compiled before).
        if (enabled && entry.imageId !== null && textures.ready(entry.imageId)) setMapped(entry, true);
        else setMapped(entry, false);
      }
    },
    dispose: () => {
      unsubscribe();
      for (const entry of entries.values()) release(entry);
      entries.clear();
    },
  };
};
