// Procedural textures of the built-in textured materials (Phase 17.1, shared/domain/house/builtinMaterials.ts):
// small seamless 512 × 512 PNGs generated in code, deterministically (seeded noise, fixed PNG encoding), so the
// same source always produces the same bytes. `npm run materials:build` writes them to server/builtin-materials/.
// (Moved from the demo-house fixtures, which now use the built-in presets.)
import { deflateSync } from "node:zlib";
import { builtInImages } from "../../shared/domain/house/builtinMaterials";

const size = 512;

type Rgb = readonly [number, number, number];

/** Deterministic pseudo-random numbers (mulberry32), so every run produces the same images. */
const random = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Smooth tileable value noise in 0…1 with `cells` lattice cells across the image. */
const noiseField = (seed: number, cells: number): ((x: number, y: number) => number) => {
  const next = random(seed);
  const lattice = Array.from({ length: cells * cells }, () => next());
  const at = (i: number, j: number): number =>
    lattice[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)] ?? 0;
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x / size) * cells;
    const fy = (y / size) * cells;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = smooth(fx - i);
    const v = smooth(fy - j);
    const top = at(i, j) * (1 - u) + at(i + 1, j) * u;
    const bottom = at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u;
    return top * (1 - v) + bottom * v;
  };
};

const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

const shade = (color: Rgb, factor: number): Rgb => [color[0] * factor, color[1] * factor, color[2] * factor];

type Painter = (x: number, y: number) => Rgb;

/** Planks running along x: rows of `rows` planks across the image, staggered joints, grain and seams. */
const planks = (seed: number, base: Rgb, rows: number, spread: number, gapPx: number, gap: Rgb): Painter => {
  const next = random(seed);
  const rowHeight = size / rows;
  const rowJoints = Array.from({ length: rows }, () => {
    const joints: number[] = [];
    let at = next() * size;
    while (joints.length < 3) {
      joints.push(at % size);
      at += size * (0.3 + next() * 0.45);
    }
    return joints.sort((a, b) => a - b);
  });
  const tones = Array.from({ length: rows * 4 }, () => 1 + (next() - 0.5) * spread);
  const grain = noiseField(seed + 7, 64);
  const fine = noiseField(seed + 11, 128);
  return (x, y) => {
    const row = Math.floor(y / rowHeight);
    const joints = rowJoints[row] ?? [];
    const inRow = y - row * rowHeight;
    if (inRow < gapPx) return gap;
    let piece = joints.findIndex((joint) => x < joint);
    if (piece < 0) piece = 0;
    if (joints.some((joint) => Math.abs(x - joint) < gapPx * 0.75)) return gap;
    const tone = tones[row * 4 + piece] ?? 1;
    const streak = Math.sin((y + grain(x, y) * 40) * 0.9 + row) * 0.04;
    return shade(base, tone + streak + (fine(x, y) - 0.5) * 0.08);
  };
};

/** A grid of tiles `across` × `down` with grout lines and a per-tile tone. */
const tiles = (
  seed: number,
  base: Rgb,
  across: number,
  down: number,
  spread: number,
  grout: Rgb,
): Painter => {
  const next = random(seed);
  const tones = Array.from({ length: across * down * 2 }, () => 1 + (next() - 0.5) * spread);
  const mottle = noiseField(seed + 3, 32);
  const tileWidth = size / across;
  const tileHeight = size / down;
  const groutPx = 2;
  return (x, y) => {
    const column = Math.floor(x / tileWidth);
    const row = Math.floor(y / tileHeight);
    if (x - column * tileWidth < groutPx || y - row * tileHeight < groutPx) return grout;
    const tone = tones[row * across + column] ?? 1;
    return shade(base, tone + (mottle(x, y) - 0.5) * spread);
  };
};

/** Running-bond tiles (each row offset by half a tile), as for slate and paving. */
const bond = (seed: number, base: Rgb, across: number, down: number, spread: number, grout: Rgb): Painter => {
  const next = random(seed);
  const tones = Array.from({ length: across * down * 2 + 2 }, () => 1 + (next() - 0.5) * spread);
  const mottle = noiseField(seed + 5, 48);
  const tileWidth = size / across;
  const tileHeight = size / down;
  return (x, y) => {
    const row = Math.floor(y / tileHeight);
    const shifted = (x + (row % 2 === 1 ? tileWidth / 2 : 0)) % size;
    const column = Math.floor(shifted / tileWidth);
    if (shifted - column * tileWidth < 3 || y - row * tileHeight < 3) return grout;
    const tone = tones[row * across + column] ?? 1;
    return shade(base, tone + (mottle(x, y) - 0.5) * spread * 1.5);
  };
};

const grass: Painter = (() => {
  const broad = noiseField(21, 8);
  const medium = noiseField(22, 32);
  const fine = noiseField(23, 256);
  return (x, y) => {
    const value = broad(x, y) * 0.35 + medium(x, y) * 0.35 + fine(x, y) * 0.3;
    return [58 + value * 40, 104 + value * 52, 40 + value * 22];
  };
})();

/** Speckled granite tiles: a grid of tiles with dark and light mineral grains over a mottled base. */
const granite = (seed: number, base: Rgb, across: number, grout: Rgb): Painter => {
  const next = random(seed);
  const tones = Array.from({ length: across * across }, () => 1 + (next() - 0.5) * 0.06);
  const mottle = noiseField(seed + 1, 24);
  const grains = noiseField(seed + 2, 256);
  const flecks = noiseField(seed + 3, 192);
  const tileSize = size / across;
  return (x, y) => {
    const column = Math.floor(x / tileSize);
    const row = Math.floor(y / tileSize);
    if (x - column * tileSize < 2 || y - row * tileSize < 2) return grout;
    const tone = (tones[row * across + column] ?? 1) + (mottle(x, y) - 0.5) * 0.12;
    const grain = grains(x, y);
    const fleck = flecks(x, y);
    if (grain > 0.8) return shade(base, tone * (0.55 + (0.9 - grain) * 1.5));
    if (fleck > 0.84) return shade([220, 214, 206], tone);
    return shade(base, tone + (grain - 0.5) * 0.18);
  };
};

/**
 * Standing-seam metal roofing (Phase 19.1): light brushed metal in vertical pans, `pans` across the image, with a
 * raised seam (a bright edge and a soft shadow) between them; the pans run along v (up the slope on a roof).
 */
const standingSeam = (seed: number, base: Rgb, pans: number): Painter => {
  const brushed = noiseField(seed, 4);
  const streaks = noiseField(seed + 1, 256);
  const panWidth = size / pans;
  return (x, y) => {
    const inPan = x % panWidth;
    const tone = 1 + (brushed(x, y) - 0.5) * 0.05 + (streaks(x, y * 0.05) - 0.5) * 0.04;
    if (inPan < 3) return shade(base, 1.12 * tone);
    if (inPan < 6) return shade(base, 0.78 * tone);
    if (inPan > panWidth - 4) return shade(base, 0.9 * tone);
    return shade(base, tone);
  };
};

/** Painters by built-in image ID (every ID in the shared catalog has one). */
const painters: Readonly<Record<string, Painter>> = {
  builtinimg_oakparquet: planks(1, [196, 152, 104], 8, 0.16, 1, [92, 66, 44]),
  builtinimg_walnut: planks(2, [118, 80, 54], 8, 0.18, 1, [52, 34, 24]),
  builtinimg_ashplanks: planks(3, [222, 198, 162], 8, 0.1, 1, [150, 126, 96]),
  builtinimg_greytiles: tiles(4, [168, 166, 160], 2, 2, 0.08, [204, 202, 196]),
  builtinimg_whitetiles: tiles(5, [236, 236, 232], 4, 4, 0.03, [188, 190, 188]),
  builtinimg_terracotta: tiles(6, [182, 102, 70], 4, 4, 0.16, [208, 196, 178]),
  builtinimg_slatetiles: bond(7, [84, 88, 92], 2, 4, 0.14, [120, 120, 118]),
  builtinimg_granite: granite(10, [122, 118, 116], 2, [168, 164, 158]),
  builtinimg_decking: planks(8, [150, 108, 74], 8, 0.14, 6, [40, 30, 22]),
  builtinimg_lawngrass: grass,
  builtinimg_paving: bond(9, [206, 190, 160], 2, 3, 0.1, [150, 140, 122]),
  builtinimg_aluminium: standingSeam(12, [196, 200, 204], 4),
};

/** IDs of catalog images without a painter (none when the generator is complete). */
export const unpaintedImageIds = (): readonly string[] =>
  builtInImages.filter((image) => painters[image.id] === undefined).map((image) => image.id);

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Uint8Array): Buffer => {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([header.subarray(4), data])), 0);
  return Buffer.concat([header, data, crc]);
};

/** A built-in texture as a 512 × 512 RGB PNG. */
export const texturePng = (imageId: string): Buffer => {
  const paint = painters[imageId];
  if (paint === undefined) throw new Error(`No painter for built-in image ${imageId}`);
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const color = paint(x, y);
      raw[row + 1 + x * 3] = clampByte(color[0]);
      raw[row + 2 + x * 3] = clampByte(color[1]);
      raw[row + 3 + x * 3] = clampByte(color[2]);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array(0)),
  ]);
};
