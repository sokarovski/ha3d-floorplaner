// Building-floor placement and slab (Phase 16, owner 2026-11-18; D03, spec/builder/model.md#floor-placement-and-slab).
// Each floor stores one placement relative to the house: a plan offset and the elevation of its finished floor, no
// rotation. Its rooms, walls, slab and contents keep their floor-local coordinates and move with it. Floors are
// ordered by elevation (ties keep document order). The accessors supply the defaults for documents that predate
// the fields (fillFloorDefaults fills them when a house is read).
import { defaultSlabThicknessMm } from "../schemas/floor";
import type { BuildingFloorValue } from "../schemas/floor";
import type { HouseDocument } from "../schemas/house";
import type { SurfaceMaterialValue } from "../schemas/values";
import { defaultSlabMaterial, effectiveWallHeightMm } from "./defaults";

export type FloorPlacement = Readonly<{
  /** Plan offset of the floor's local frame in the house (mm). */
  xMm: number;
  yMm: number;
  /** Finished-floor elevation above the house's zero (mm). */
  elevationMm: number;
}>;

export type FloorSlab = Readonly<{ thicknessMm: number; material: SurfaceMaterialValue }>;

type PlacedFloor = Pick<BuildingFloorValue, "positionMm" | "elevationMm">;

/** The floor's placement in the house; absent fields mean 0. */
export const floorPlacementOf = (floor: PlacedFloor): FloorPlacement => ({
  xMm: floor.positionMm?.x ?? 0,
  yMm: floor.positionMm?.y ?? 0,
  elevationMm: floor.elevationMm ?? 0,
});

const fallbackSlabMaterial = defaultSlabMaterial();

/** The floor's slab: its thickness (absent: 200 mm; 0 = no slab) and material (absent: Concrete). */
export const floorSlabOf = (
  floor: Pick<BuildingFloorValue, "slabThicknessMm" | "slabMaterial">,
): FloorSlab => ({
  thicknessMm: Math.max(0, floor.slabThicknessMm ?? defaultSlabThicknessMm),
  material: floor.slabMaterial ?? fallbackSlabMaterial,
});

/**
 * The floor's tallest authored wall (mm), or the house's default wall height when it has no walls. Walls rising to
 * the roof (Phase 19.2) are ignored, and so are yard fences (Phase 17.2): a yard carries nothing above it.
 */
export const tallestWallMm = (
  floor: Pick<BuildingFloorValue, "areas">,
  house: Pick<HouseDocument, "defaultWallHeightMm">,
): number => {
  const heights = floor.areas
    .filter((area) => area.kind !== "yard")
    .flatMap((area) => area.walls.map((wall) => wall.heightMm));
  return heights.length === 0 ? effectiveWallHeightMm(house) : Math.max(...heights);
};

/**
 * Suggested finished-floor elevation for a new floor directly above `below` (owner decision 1, 2026-11-18): the
 * lower finished floor + its tallest wall + the new floor's slab thickness, so the new slab's underside rests on
 * the lower wall tops. A one-time suggestion, not a live constraint.
 */
export const suggestedElevationAboveMm = (
  below: Pick<BuildingFloorValue, "areas" | "positionMm" | "elevationMm">,
  house: Pick<HouseDocument, "defaultWallHeightMm">,
  newSlabThicknessMm: number = defaultSlabThicknessMm,
): number => floorPlacementOf(below).elevationMm + tallestWallMm(below, house) + newSlabThicknessMm;

/** The house's floors from lowest to highest finished floor (ties keep document order): Up/Down order. */
export const floorsByElevation = <T extends PlacedFloor>(floors: readonly T[]): readonly T[] =>
  floors
    .map((floor, index) => ({ floor, index, elevation: floorPlacementOf(floor).elevationMm }))
    .sort((a, b) => a.elevation - b.elevation || a.index - b.index)
    .map(({ floor }) => floor);

/**
 * Whether the builder has a whole-house level above the floors (Phase 16.4, owner decision 5): houses with more than
 * one floor; a one-floor house opens on its floor. A one-floor house with a roof has it too (Phase 19.1): roofs are
 * drawn only in the whole-house views (and while editing them), so that is where its roof is seen.
 */
export const hasHouseOverview = (house: Pick<HouseDocument, "floors">): boolean =>
  house.floors.length > 1 || house.floors.some((floor) => (floor.roofs ?? []).length > 0);

/** The highest floor (last by elevation), or undefined for no floors. */
export const topFloor = <T extends PlacedFloor>(floors: readonly T[]): T | undefined => {
  const ordered = floorsByElevation(floors);
  return ordered[ordered.length - 1];
};
