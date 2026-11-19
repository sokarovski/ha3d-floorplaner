// Roofs (Phase 19.1, owner 2026-11-18; spec/builder/features/roofs.md): defaults, the Add roof outline, and the
// accessors the builder, the renderer and the HA viewer share.
import { createId } from "../ids";
import type { AreaValue } from "../schemas/area";
import type { BuildingFloorValue } from "../schemas/floor";
import type { HouseDocument } from "../schemas/house";
import type { RoofValue } from "../schemas/roof";
import type { SurfaceMaterialValue } from "../schemas/values";
import { rectangleSheet } from "../../geometry/roofSheet";
import { computeAreaFloorGeometry } from "../../geometry/areaGeometry";
import { slabCoverage } from "../../geometry/floorSlab";
import { regionBounds } from "../../geometry/region";
import { builtInPresets } from "./defaults";
import { floorsByElevation, tallestWallMm } from "./floorPlacement";

/** Add roof: the outline is the floor's bounding box grown by this on every side (owner decision 2). */
export const addRoofMarginMm = 400;

/** Defaults of a new roof (implementation conventions). */
export const roofDefaults = {
  thicknessMm: 200,
  ribHeightMm: 160,
  ribWidthMm: 60,
  ribSpacingMm: 600,
} as const;

/** Rib materials (owner: wood or metal; no per-rib settings): a plain timber and a plain light metal. */
export const ribMaterials: Readonly<Record<RoofValue["ribMaterial"], SurfaceMaterialValue>> = {
  wood: {
    pbrMetallicRoughness: { baseColorFactor: [0.5, 0.33, 0.19, 1], roughnessFactor: 0.75, metallicFactor: 0 },
    extras: { homeplan: { tileSizeMm: { x: 1000, y: 1000 }, rotationDeg: 0, offsetMm: { x: 0, y: 0 } } },
  },
  metal: {
    pbrMetallicRoughness: {
      baseColorFactor: [0.62, 0.64, 0.66, 1],
      roughnessFactor: 0.45,
      metallicFactor: 0.4,
    },
    extras: { homeplan: { tileSizeMm: { x: 1000, y: 1000 }, rotationDeg: 0, offsetMm: { x: 0, y: 0 } } },
  },
};

const presetMaterial = (id: string): SurfaceMaterialValue => {
  const preset = builtInPresets.find((candidate) => candidate.id === id);
  if (preset === undefined) throw new Error(`Unknown built-in preset ${id}`);
  return structuredClone(preset.material);
};

/** The floor's roofs (absent reads as none). */
export const roofsOf = (floor: Pick<BuildingFloorValue, "roofs">): readonly RoofValue[] => floor.roofs ?? [];

/** Whether any floor of the house has a roof (the house then has a whole-house level, where roofs are seen). */
export const houseHasRoof = (house: Pick<HouseDocument, "floors">): boolean =>
  house.floors.some((floor) => roofsOf(floor).length > 0);

/** Whether a roof is an attached canopy (19.3: Cuts walls off; it cuts nothing). */
export const isCanopy = (roof: Pick<RoofValue, "cutsWalls">): boolean => !roof.cutsWalls;

/** Whether Add roof applies to the floor: the top floor (19.1), with rooms, and no cutting roof yet. */
export const canAddRoof = (
  house: Pick<HouseDocument, "floors">,
  floor: Pick<BuildingFloorValue, "id" | "roofs">,
): boolean => {
  const ordered = floorsByElevation(house.floors);
  return ordered[ordered.length - 1]?.id === floor.id && !roofsOf(floor).some((roof) => roof.cutsWalls);
};

/** Add canopy (19.3): the default canopy's size where no area gives one, its height and thickness. */
export const canopyDefaults = {
  widthMm: 3000,
  depthMm: 2500,
  /** The largest area a canopy covers whole (wider areas get the default size at their centre). */
  maxCoverMm: 6000,
  eaveHeightMm: 2400,
  thicknessMm: 120,
} as const;

/**
 * A new flat roof for the floor: its outline is the floor's bounding box (rooms and their walls, yards left out)
 * grown by 400 mm on every side; eave height = the floor's tallest wall; closed, terracotta on top, pale wood
 * underneath, white sides. Null when the floor has no rooms to cover.
 */
export const createRoof = (
  floor: BuildingFloorValue,
  house: Pick<HouseDocument, "defaultWallHeightMm">,
  name: string,
): RoofValue | null => {
  const coverage = slabCoverage(floor);
  if (coverage.polygons.length === 0) return null;
  const bounds = regionBounds(coverage);
  const sheet = rectangleSheet(
    { x: bounds.minX - addRoofMarginMm, y: bounds.minY - addRoofMarginMm },
    { x: bounds.maxX + addRoofMarginMm, y: bounds.maxY + addRoofMarginMm },
    { point: () => createId("rp"), line: () => createId("rl") },
  );
  return {
    id: createId("rf"),
    name,
    design: "closed",
    cutsWalls: true,
    wallsRise: true,
    eaveHeightMm: tallestWallMm(floor, house),
    thicknessMm: roofDefaults.thicknessMm,
    topMaterial: presetMaterial("builtin_terracotta"),
    bottomMaterial: presetMaterial("builtin_ashplanks"),
    sideMaterial: presetMaterial("builtin_capwhite"),
    ribHeightMm: roofDefaults.ribHeightMm,
    ribWidthMm: roofDefaults.ribWidthMm,
    ribSpacingMm: roofDefaults.ribSpacingMm,
    ribMaterial: "wood",
    points: [...sheet.points],
    outline: [...sheet.outline],
    lines: [...sheet.lines],
  };
};

/**
 * A new attached canopy (19.3, Cuts walls off: it cuts nothing): over `area` (a room, yard or terrace) its bounding
 * box when that is at most 6 m each way, else 3000 × 2500 mm at its centre; without an area the default size at
 * the floor's centre. Flat, 120 mm thick, aluminium on top, at 2400 mm (or on a room's tallest wall when higher),
 * closed design. Moved like the roof (its level's Move, typed values).
 */
export const createCanopy = (
  floor: BuildingFloorValue,
  area: AreaValue | undefined,
  name: string,
): RoofValue => {
  const bounds = (() => {
    const region = area === undefined ? slabCoverage(floor) : computeAreaFloorGeometry(area).floorShape;
    return region.polygons.length === 0 ? { minX: 0, minY: 0, maxX: 0, maxY: 0 } : regionBounds(region);
  })();
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxY - bounds.minY;
  const whole =
    area !== undefined &&
    width > 0 &&
    depth > 0 &&
    width <= canopyDefaults.maxCoverMm &&
    depth <= canopyDefaults.maxCoverMm;
  const centre = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  const half = whole
    ? { x: width / 2, y: depth / 2 }
    : { x: canopyDefaults.widthMm / 2, y: canopyDefaults.depthMm / 2 };
  const sheet = rectangleSheet(
    { x: Math.round(centre.x - half.x), y: Math.round(centre.y - half.y) },
    { x: Math.round(centre.x + half.x), y: Math.round(centre.y + half.y) },
    { point: () => createId("rp"), line: () => createId("rl") },
  );
  const wallTop =
    area === undefined || area.kind === "yard" ? 0 : Math.max(0, ...area.walls.map((wall) => wall.heightMm));
  return {
    id: createId("rf"),
    name,
    design: "closed",
    cutsWalls: false,
    wallsRise: false,
    eaveHeightMm: Math.max(canopyDefaults.eaveHeightMm, wallTop),
    thicknessMm: canopyDefaults.thicknessMm,
    topMaterial: presetMaterial("builtin_aluminium"),
    bottomMaterial: presetMaterial("builtin_capwhite"),
    sideMaterial: presetMaterial("builtin_capwhite"),
    ribHeightMm: roofDefaults.ribHeightMm,
    ribWidthMm: roofDefaults.ribWidthMm,
    ribSpacingMm: roofDefaults.ribSpacingMm,
    ribMaterial: "metal",
    points: [...sheet.points],
    outline: [...sheet.outline],
    lines: [...sheet.lines],
  };
};
