// Automatic floor cuts (Phase 16.14, owner 2026-11-18; spec/builder/features/staircase-areas.md#automatic-cutouts):
// a derived pre-render step, never persisted. Every object tagged `floorCut` on every floor of the house is a cutter:
// its footprint (widthMm × depthMm, a rectangle or an ellipse) composed object → area → floor → house. Floor F
// (elevation e, slab thickness t) is cut by the floor openings on F, the stairs on F with Cut floor below, and the
// stairs of every other floor with Cut floor above whose height span (floor elevation + elevationMm, up by the
// rise) crosses F's slab band: bottom below e and top at or above e − t. The union, moved into F's frame, is
// subtracted from F's RealFloor and slab (buildRealFloors / buildFloorSlab with these cuts).
import { DraftSafeWeakMap } from "./draftSafeWeakMap";
import { cutsFloorAbove, cutsOwnFloor, floorCutSizeMm, stairRiseMm } from "@shared/domain/house/stairs";
import { floorSlabOf } from "@shared/domain/house/floorPlacement";
import type { AreaValue } from "@shared/domain/schemas/area";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { AreableInstanceValue } from "@shared/domain/schemas/instances";
import { composeAffine, placementAffine } from "./affine";
import { areaToFloorAffine, floorToHouseOffset } from "./placement";
import { unionRings } from "./polygonKernel";
import type { Region, Ring } from "./region";
import { emptyRegion, transformRing } from "./region";

export type FloorCutter = Readonly<{
  objectId: string;
  floorId: string;
  kind: "stair" | "opening";
  /** Footprint in the house plan frame (mm). */
  ring: Ring;
  /** Height span in the house frame (mm): the object's base and, for a stair, its top. */
  bottomMm: number;
  topMm: number;
  cutsAbove: boolean;
  cutsOwn: boolean;
}>;

/** A floor's cuts in its own frame, with a signature of the cutters (equal signature = equal region). */
export type FloorCuts = Readonly<{ region: Region; signature: string }>;

export const noFloorCuts: FloorCuts = { region: emptyRegion, signature: "" };

/** Segments of an ellipse footprint (implementation convention). */
const ellipseSegments = 48;
/** Height tolerance of the span test (mm, implementation convention). */
const spanToleranceMm = 1;

/** The footprint in the object's own plan frame: x across (template x), y along the run (template z). */
const localFootprint = (object: AreableInstanceValue): Ring | null => {
  const size = floorCutSizeMm(object);
  if (size === null) return null;
  const halfW = size.widthMm / 2;
  const halfD = size.depthMm / 2;
  if (object.floorCut === "opening" && object.floorCutShape === "ellipse")
    return Array.from({ length: ellipseSegments }, (_, index) => {
      const angle = (index / ellipseSegments) * Math.PI * 2;
      return { x: halfW * Math.cos(angle), y: halfD * Math.sin(angle) };
    });
  return [
    { x: -halfW, y: -halfD },
    { x: halfW, y: -halfD },
    { x: halfW, y: halfD },
    { x: -halfW, y: halfD },
  ];
};

/** The object's footprint in its floor's frame, or null (no floor cut, not on the floor, or no size). */
export const floorCutRing = (area: AreaValue, object: AreableInstanceValue): Ring | null => {
  if (object.floorCut === undefined || object.attachment.host !== "floor") return null;
  const local = localFootprint(object);
  if (local === null) return null;
  return transformRing(
    local,
    composeAffine(areaToFloorAffine(area), placementAffine(object.positionMm, object.rotationDeg)),
  );
};

const cutterCache = new DraftSafeWeakMap<readonly BuildingFloorValue[], readonly FloorCutter[]>();

/** Every floor cutter of the house (saved-Hidden objects and rooms excepted). Memoized by the floors array. */
export const floorCutters = (house: Pick<HouseDocument, "floors">): readonly FloorCutter[] => {
  const cached = cutterCache.get(house.floors);
  if (cached !== undefined) return cached;
  const cutters: FloorCutter[] = [];
  for (const floor of house.floors) {
    const offset = floorToHouseOffset(floor);
    for (const area of floor.areas) {
      if (area.hidden === true) continue;
      for (const object of area.objects) {
        if (object.hidden === true || object.floorCut === undefined) continue;
        const ring = floorCutRing(area, object);
        if (ring === null) continue;
        const bottomMm = offset.h + object.elevationMm;
        cutters.push({
          objectId: object.id,
          floorId: floor.id,
          kind: object.floorCut,
          ring: ring.map((point) => ({ x: point.x + offset.x, y: point.y + offset.y })),
          bottomMm,
          topMm: bottomMm + (object.floorCut === "stair" ? stairRiseMm(object) : 0),
          cutsAbove: cutsFloorAbove(object),
          cutsOwn: cutsOwnFloor(object),
        });
      }
    }
  }
  cutterCache.set(house.floors, cutters);
  return cutters;
};

/** Whether a cutter cuts `floor` (see the file comment). */
export const cutsFloor = (cutter: FloorCutter, floor: BuildingFloorValue): boolean => {
  if (cutter.floorId === floor.id) return cutter.cutsOwn;
  if (!cutter.cutsAbove) return false;
  const top = floorToHouseOffset(floor).h;
  const bandBottom = top - floorSlabOf(floor).thicknessMm;
  return cutter.bottomMm < top - spanToleranceMm && cutter.topMm >= bandBottom - spanToleranceMm;
};

const cutsCache = new DraftSafeWeakMap<BuildingFloorValue, FloorCuts>();

/**
 * The cuts of `floorId` in its own frame, or `noFloorCuts`. The region is recomputed only when the signature (the
 * cutting footprints in the floor's frame) changes, so callers can key their caches on it.
 */
export const floorCutsOf = (house: Pick<HouseDocument, "floors">, floorId: string): FloorCuts => {
  const floor = house.floors.find((candidate) => candidate.id === floorId);
  if (floor === undefined) return noFloorCuts;
  const offset = floorToHouseOffset(floor);
  const rings = floorCutters(house)
    .filter((cutter) => cutsFloor(cutter, floor))
    .map((cutter) => cutter.ring.map((point) => ({ x: point.x - offset.x, y: point.y - offset.y })));
  if (rings.length === 0) return noFloorCuts;
  const signature = rings
    .map((ring) => ring.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(";"))
    .join("/");
  const cached = cutsCache.get(floor);
  if (cached?.signature === signature) return cached;
  const cuts: FloorCuts = { region: unionRings(rings, { closeContacts: false }), signature };
  cutsCache.set(floor, cuts);
  return cuts;
};
