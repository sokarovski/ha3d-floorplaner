// House image textures, cached by image ID. Each surface material gets its own Texture (sharing the GPU
// source) carrying that surface's tile transform. Loads that finish after a sweep or dispose are ignored.
//
// Readiness (Phase 15.1): a texture is "ready" once its image is decoded (and, with staged loading, uploaded to the
// GPU). Until then the material cache draws the material without its map, in its base colour (or the image's
// remembered average colour), never sampling an empty texture, which draws black. Subscribers hear when an image
// becomes ready or fails.
//
// Staged loading (opt-in, the HA viewer): requests go through the host's load queue, images decode off the main
// thread (`createImageBitmap` through ImageBitmapLoader, where supported), and the host's `prepare` uploads each
// decoded image (renderer.initTexture, a few per frame) before any material uses it. Without options (the builder)
// every image loads on request through TextureLoader, as before.
import { ImageBitmapLoader, RepeatWrapping, SRGBColorSpace, Texture, TextureLoader } from "three";
import type { AssetReader } from "./assetTransport";
import type { LoadQueue } from "./loadQueue";
import type { TexturePlacementValue } from "./surfaceMaterialKey";

type Entry = {
  /** Never drawn: carries the users' upload parameters, so preparing it uploads the image they share. */
  readonly base: Texture;
  state: "loading" | "ready" | "failed";
  readonly users: Set<Texture>;
};

/** sRGB 0..1 average colour of an image. */
export type Swatch = readonly [number, number, number];

/** Remembers each image's average colour between visits (the HA viewer keeps it in localStorage). */
export type SwatchMemory = Readonly<{
  get: (imageId: string) => Swatch | null;
  set: (imageId: string, swatch: Swatch) => void;
}>;

/** One measured step of an image's load (opt-in timing, Phase 15.1). */
export type TextureTiming = Readonly<{ imageId: string; step: "fetch+decode" | "prepare"; ms: number }>;

export type TextureLoading = Readonly<{
  /** Lane of the host's queue that texture requests wait in. */
  queue: LoadQueue;
  lane: number;
  /** Uploads a decoded image (the cache's base texture) before materials use it; resolves when done. */
  prepare?: (texture: Texture) => Promise<void>;
  swatches?: SwatchMemory;
  onTiming?: (timing: TextureTiming) => void;
}>;

export type TextureCache = Readonly<{
  /** A new texture for one material, sharing the image source and carrying its own placement. */
  acquire: (imageId: string, placement: TexturePlacementValue | undefined) => Texture;
  /** Releases one texture returned by acquire. */
  release: (imageId: string, texture: Texture) => void;
  /** True once the image can be drawn: decoded (and prepared), or failed (its placeholder checker). */
  ready: (imageId: string) => boolean;
  /** The image's average colour, once decoded or remembered; null when unknown. */
  swatch: (imageId: string) => Swatch | null;
  /** Called with the image ID when an image becomes ready or fails. */
  subscribe: (listener: (imageId: string) => void) => () => void;
  dispose: () => void;
}>;

const defaultPlacement: TexturePlacementValue = {
  tileSizeMm: { x: 1000, y: 1000 },
  rotationDeg: 0,
  offsetMm: { x: 0, y: 0 },
};

/**
 * Applies a physical tile placement to a texture whose UVs are in mm: one repeat per tile size, rotation in
 * the UV plane about the UV origin, and offset in mm (the texture moves by +offset along the surface).
 * This is the Three.js equivalent of KHR_texture_transform for mm UVs.
 */
export const applyPlacement = (texture: Texture, placement: TexturePlacementValue | undefined): void => {
  const { tileSizeMm, rotationDeg, offsetMm } = placement ?? defaultPlacement;
  const tileX = tileSizeMm.x > 0 ? tileSizeMm.x : 1000;
  const tileY = tileSizeMm.y > 0 ? tileSizeMm.y : 1000;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1 / tileX, 1 / tileY);
  texture.offset.set(-offsetMm.x / tileX, -offsetMm.y / tileY);
  texture.rotation = (rotationDeg * Math.PI) / 180;
  texture.center.set(0, 0);
};

/** Magenta/grey checker shown when an image cannot be loaded. */
const createPlaceholder = (): Texture => {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const context = canvas.getContext("2d");
  if (context !== null) {
    context.fillStyle = "#787878";
    context.fillRect(0, 0, 2, 2);
    context.fillStyle = "#ff00ff";
    context.fillRect(0, 0, 1, 1);
    context.fillRect(1, 1, 1, 1);
  }
  const texture = new Texture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

export const createTextureCache = (
  imageUrl: (imageId: string) => string,
  anisotropy: number,
  onChange: () => void,
  readAsset?: AssetReader,
  loading?: TextureLoading,
): TextureCache => {
  const loader = new TextureLoader();
  // Off-thread decode where supported (Safari 17+, Chrome, Firefox 98+). The bitmap is flipped at decode, so the
  // textures keep flipY off and sample exactly as TextureLoader's flipped images.
  const bitmaps = loading !== undefined && typeof createImageBitmap !== "undefined";
  const bitmapLoader = bitmaps ? new ImageBitmapLoader() : null;
  bitmapLoader?.setOptions({ imageOrientation: "flipY", premultiplyAlpha: "none" });
  const fetchUrl = async (url: string): Promise<{ url: string; revoke: () => void }> => {
    if (readAsset === undefined) return { url, revoke: () => undefined };
    const blobUrl = URL.createObjectURL(await readAsset(url));
    return {
      url: blobUrl,
      revoke: () => {
        URL.revokeObjectURL(blobUrl);
      },
    };
  };
  const loadImage = async (url: string): Promise<Texture> => {
    const source = await fetchUrl(url);
    try {
      if (bitmapLoader === null) return await loader.loadAsync(source.url);
      const bitmap = await bitmapLoader.loadAsync(source.url);
      const texture = new Texture(bitmap);
      texture.flipY = false;
      return texture;
    } finally {
      source.revoke();
    }
  };
  const entries = new Map<string, Entry>();
  const swatches = new Map<string, Swatch>();
  const listeners = new Set<(imageId: string) => void>();
  const placeholder = createPlaceholder();
  let disposed = false;

  const notify = (imageId: string): void => {
    for (const listener of [...listeners]) listener(imageId);
    onChange();
  };

  /** The users' upload parameters (wrap, anisotropy, orientation), so all of them share one GPU texture. */
  const configure = (texture: Texture): void => {
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = anisotropy;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.flipY = !bitmaps;
  };

  const applyPlaceholder = (texture: Texture): void => {
    texture.source = placeholder.source;
    texture.flipY = true;
    texture.needsUpdate = true;
  };

  /** Frees a decoded ImageBitmap's memory now, not at garbage collection (dispose frees only the GPU copy). */
  const closeBitmap = (texture: Texture): void => {
    const image: unknown = texture.source.data;
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) image.close();
  };

  const remember = (imageId: string, image: unknown): void => {
    if (!(typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap)) return;
    const swatch = averageColour(image);
    if (swatch === null) return;
    swatches.set(imageId, swatch);
    loading?.swatches?.set(imageId, swatch);
  };

  const load = (imageId: string): Entry => {
    const base = new Texture();
    configure(base);
    const entry: Entry = { base, state: "loading", users: new Set() };
    entries.set(imageId, entry);
    const alive = (): boolean => !disposed && entries.get(imageId) === entry;
    const run = async (): Promise<void> => {
      if (!alive()) return;
      const started = performance.now();
      let loaded: Texture;
      try {
        loaded = await loadImage(imageUrl(imageId));
      } catch {
        if (!alive()) return;
        console.warn(`Viewport: image ${imageId} could not be loaded; showing a placeholder texture.`);
        entry.state = "failed";
        for (const user of entry.users) applyPlaceholder(user);
        notify(imageId);
        return;
      }
      loading?.onTiming?.({ imageId, step: "fetch+decode", ms: performance.now() - started });
      if (!alive()) {
        loaded.dispose();
        closeBitmap(loaded);
        return;
      }
      remember(imageId, loaded.image);
      // Users first, then the base: every texture shares the source at its final version, so the one upload below
      // serves them all (a user flagged later would upload the image again).
      for (const user of entry.users) {
        user.source = loaded.source;
        user.needsUpdate = true;
      }
      base.source = loaded.source;
      base.needsUpdate = true;
      if (loading?.prepare !== undefined) {
        const preparing = performance.now();
        await loading.prepare(base);
        loading.onTiming?.({ imageId, step: "prepare", ms: performance.now() - preparing });
        if (!alive()) return;
      }
      entry.state = "ready";
      notify(imageId);
    };
    if (loading === undefined) void run();
    else loading.queue.enqueue({ lane: loading.lane, kind: "texture", run });
    return entry;
  };

  return {
    acquire: (imageId, placement) => {
      const entry = entries.get(imageId) ?? load(imageId);
      // A fresh texture, not a clone: clones of a still-loading base would be flagged for upload without data.
      const texture = new Texture();
      configure(texture);
      applyPlacement(texture, placement);
      if (entry.base.source.data !== null) {
        texture.source = entry.base.source;
        texture.needsUpdate = true;
      }
      if (entry.state === "failed") applyPlaceholder(texture);
      entry.users.add(texture);
      return texture;
    },
    release: (imageId, texture) => {
      texture.dispose();
      const entry = entries.get(imageId);
      if (entry === undefined) return;
      entry.users.delete(texture);
      if (entry.users.size === 0) {
        entry.base.dispose();
        closeBitmap(entry.base);
        entries.delete(imageId);
      }
    },
    ready: (imageId) => {
      const state = entries.get(imageId)?.state;
      return state === "ready" || state === "failed";
    },
    swatch: (imageId) => swatches.get(imageId) ?? loading?.swatches?.get(imageId) ?? null,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose: () => {
      disposed = true;
      listeners.clear();
      for (const entry of entries.values()) {
        for (const user of entry.users) user.dispose();
        entry.base.dispose();
        closeBitmap(entry.base);
      }
      entries.clear();
      placeholder.dispose();
    },
  };
};

/** The average sRGB colour of a decoded image (a 4 × 4 downscale), or null where no 2D canvas is available. */
const averageColour = (image: ImageBitmap): Swatch | null => {
  if (typeof OffscreenCanvas === "undefined") return null;
  const size = 4;
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext("2d");
  if (context === null) return null;
  context.drawImage(image, 0, 0, size, size);
  const pixels = context.getImageData(0, 0, size, size).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = (pixels[index + 3] ?? 0) / 255;
    r += (pixels[index] ?? 0) * alpha;
    g += (pixels[index + 1] ?? 0) * alpha;
    b += (pixels[index + 2] ?? 0) * alpha;
    weight += alpha;
  }
  if (weight <= 0) return null;
  return [r / weight / 255, g / weight / 255, b / weight / 255];
};
