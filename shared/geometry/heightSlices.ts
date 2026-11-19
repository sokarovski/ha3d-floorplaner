// 2.5D height bands (D05): distinct wall heights, opening bottoms/tops, and relief bottoms/tops split the
// floor's walls into slices with a constant footprint: union of the bands tall enough and the boxes spanning
// the slice, minus the niches and openings spanning it (Phase 5.0: boxes and niches are relief prisms).
// Slice footprints are cached by a content signature, so after an edit only slices whose inputs changed
// are recomputed (incremental per affected height band).
import { differenceRegions, unionRings } from "./polygonKernel";
import type { Region } from "./region";
import type { FloorBand } from "./realAllWallsTypes";
import type { Ring } from "./region";
import type { ReliefPrism } from "./wallReliefs";

/** Anything that cuts a vertical prism out of the walls between two heights (openings, niches). */
export type CutPrism = Readonly<{ footprint: Ring; bottomMm: number; topMm: number }>;
import { heightToleranceMm } from "./tolerances";

export type SliceInputs = Readonly<{
  bottomMm: number;
  topMm: number;
  bands: readonly FloorBand[];
  /** Boxes active in this slice (added to the band union). */
  adds: readonly ReliefPrism[];
  cuts: readonly CutPrism[];
  /** Relief prisms active in this slice (their sides are owned faces). */
  reliefs: readonly ReliefPrism[];
}>;

const sliceCacheLimit = 256;
const sliceCache = new Map<string, Region>();

/** Sorted distinct height levels: 0, every wall height, every opening and relief bottom and top. */
export const heightLevels = (bands: readonly FloorBand[], prisms: readonly CutPrism[]): number[] => {
  const raw = [
    0,
    ...bands.map((band) => band.heightMm),
    ...prisms.flatMap((prism) => [prism.bottomMm, prism.topMm]),
  ].sort((a, b) => a - b);
  const levels: number[] = [];
  for (const value of raw) {
    const last = levels[levels.length - 1];
    if (last === undefined || value - last > heightToleranceMm) levels.push(value);
  }
  return levels;
};

export const sliceInputs = (
  levels: readonly number[],
  bands: readonly FloorBand[],
  prisms: readonly CutPrism[],
  reliefs: readonly ReliefPrism[] = [],
): SliceInputs[] => {
  const slices: SliceInputs[] = [];
  for (let index = 0; index + 1 < levels.length; index += 1) {
    const bottomMm = levels[index];
    const topMm = levels[index + 1];
    if (bottomMm === undefined || topMm === undefined) continue;
    const sliceBands = bands.filter((band) => band.heightMm >= topMm - heightToleranceMm);
    if (sliceBands.length === 0) continue;
    const spans = (prism: CutPrism): boolean =>
      prism.bottomMm <= bottomMm + heightToleranceMm && prism.topMm >= topMm - heightToleranceMm;
    const active = reliefs.filter(spans);
    const cuts = [...prisms.filter(spans), ...active.filter((relief) => relief.mode === "cut")];
    const adds = active.filter((relief) => relief.mode === "add");
    slices.push({ bottomMm, topMm, bands: sliceBands, adds, cuts, reliefs: active });
  }
  return slices;
};

const ringSignature = (ring: readonly { x: number; y: number }[]): string =>
  ring.map((point) => `${point.x.toFixed(4)},${point.y.toFixed(4)}`).join(";");

const sliceSignature = (slice: SliceInputs): string =>
  [
    ...slice.bands.map((band) => ringSignature(band.ring)),
    "+",
    ...slice.adds.map((add) => ringSignature(add.footprint)),
    "|",
    ...slice.cuts.map((cut) => ringSignature(cut.footprint)),
  ].join("/");

export const sliceFootprint = (slice: SliceInputs): Region => {
  const key = sliceSignature(slice);
  const cached = sliceCache.get(key);
  if (cached !== undefined) {
    sliceCache.delete(key);
    sliceCache.set(key, cached);
    return cached;
  }
  const united = unionRings([
    ...slice.bands.map((band) => band.ring),
    ...slice.adds.map((add) => add.footprint),
  ]);
  const footprint =
    slice.cuts.length === 0
      ? united
      : differenceRegions(
          united,
          unionRings(
            slice.cuts.map((cut) => cut.footprint),
            { closeContacts: false },
          ),
        );
  sliceCache.set(key, footprint);
  if (sliceCache.size > sliceCacheLimit) {
    const oldest = sliceCache.keys().next();
    if (oldest.done !== true) sliceCache.delete(oldest.value);
  }
  return footprint;
};
