// "Demo: Family house" attic (2026-11-18; Phase 19.2): a copy of the First floor stacked as a new top floor at the
// suggested elevation, every entity with a fresh ID, under a pitched roof that cuts its walls (Cuts walls, Walls rise
// to the roof): the walls keep the First floor's heights and are clipped under the slopes and raised to the ridge at
// the gable. Self-contained so the rest of the family-house fixture stays untouched: familyHouse.ts appends
// `familyAttic(firstFloor, house)`.
import { suggestedElevationAboveMm } from "../../../shared/domain/house/floorPlacement";
import { createId } from "../../../shared/domain/ids";
import type { BuildingFloorValue } from "../../../shared/domain/schemas/floor";
import type { HouseDocument } from "../../../shared/domain/schemas/house";
import type { RoofValue } from "../../../shared/domain/schemas/roof";
import { builtInPresets } from "../../../shared/domain/house/defaults";
import { roofDefaults } from "../../../shared/domain/house/roofs";
import { openingSizeFromParameters } from "../../../shared/domain/templates/openingSize";
import { fitUnderRoof, itemsAboveRoof, wallItemTopLimitMm } from "../../../shared/geometry/roofItems";

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord => typeof value === "object" && value !== null;

/** A fresh ID with the old ID's prefix ("w_…" → "w_<new suffix>"). */
const freshLike = (old: string): string => {
  const prefix = old.slice(0, old.indexOf("_"));
  return `${prefix}_${createId("x").slice(2)}`;
};

const collectIds = (value: unknown, ids: Map<string, string>, fresh: (old: string) => string): void => {
  if (Array.isArray(value)) {
    for (const item of value) collectIds(item, ids, fresh);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (key === "id" && typeof entry === "string" && entry.includes("_")) {
      if (!ids.has(entry)) ids.set(entry, fresh(entry));
    } else collectIds(entry, ids, fresh);
  }
};

/** Rewrites every string that is an old ID, or a ">"-joined vertex-ID pair (wall source edges). */
const remap = (text: string, ids: ReadonlyMap<string, string>): string =>
  text
    .split(">")
    .map((part) => ids.get(part) ?? part)
    .join(">");

const rewriteIds = (value: unknown, ids: ReadonlyMap<string, string>): void => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (typeof item === "string") value[index] = remap(item, ids);
      else rewriteIds(item, ids);
    });
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") value[key] = remap(entry, ids);
    else rewriteIds(entry, ids);
  }
};

/**
 * A deep copy of `value` in which every entity ID (each `id` field, in document order) is replaced by `fresh(old)`,
 * and every reference to it (equal strings and ">"-joined vertex pairs) with it.
 */
export const reidentified = <T>(value: T, fresh: (old: string) => string): T => {
  const copy = structuredClone(value);
  const ids = new Map<string, string>();
  collectIds(copy, ids, fresh);
  rewriteIds(copy, ids);
  return copy;
};

/** A deep copy of `floor` in which every entity (floor, areas, shapes, vertices, walls, objects, …) has a new ID. */
export const reidentifiedFloor = (floor: BuildingFloorValue): BuildingFloorValue =>
  reidentified(floor, freshLike);

const preset = (id: string): RoofValue["topMaterial"] => {
  const found = builtInPresets.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`No built-in preset ${id}`);
  return structuredClone(found.material);
};

/**
 * The attic's roof (Phase 19.1, drawn as a user would): Add roof's outline (the walls' outer faces −300…10700 ×
 * −300…8900 grown by 400 mm), a ridge along x at y = 4300 from the east gable to x = 4300, and two hip lines from the
 * west corners to the ridge's west end; the ridge pulled up 3500 mm. A 35° pitch (0.7): the eave 400 mm outside the
 * walls at 720 mm, 1000 mm knee walls at the outer faces, the ridge at 720 + 3500 = 4220 mm. Closed, terracotta tiles,
 * pale wood underside. It cuts the attic's walls, and the walls rise to it (the east gable fills to the ridge).
 * Phase 19.3: a roof window ("Skylight", the built-in roof-window template, 780 × 1180 mm) on the south slope over
 * the attic's main bedroom.
 */
export const familyAtticRoof = (): RoofValue => {
  const point = (x: number, y: number, heightMm = 0): RoofValue["points"][number] => ({
    id: createId("rp"),
    x,
    y,
    heightMm,
  });
  const sw = point(-700, -700);
  const se = point(11100, -700);
  const east = point(11100, 4300, 3500);
  const ne = point(11100, 9300);
  const nw = point(-700, 9300);
  const ridgeWest = point(4300, 4300, 3500);
  const line = (a: { id: string }, b: { id: string }): RoofValue["lines"][number] => ({
    id: createId("rl"),
    a: a.id,
    b: b.id,
  });
  return {
    id: createId("rf"),
    name: "Roof",
    design: "closed",
    cutsWalls: true,
    wallsRise: true,
    eaveHeightMm: 720,
    thicknessMm: roofDefaults.thicknessMm,
    topMaterial: preset("builtin_terracotta"),
    bottomMaterial: preset("builtin_ashplanks"),
    sideMaterial: preset("builtin_capwhite"),
    ribHeightMm: roofDefaults.ribHeightMm,
    ribWidthMm: roofDefaults.ribWidthMm,
    ribSpacingMm: roofDefaults.ribSpacingMm,
    ribMaterial: "wood",
    points: [sw, se, east, ne, nw, ridgeWest],
    outline: [sw.id, se.id, east.id, ne.id, nw.id],
    lines: [line(ridgeWest, east), line(sw, ridgeWest), line(nw, ridgeWest)],
    windows: [
      {
        id: createId("rw"),
        name: "Skylight",
        templateId: "roof-window",
        templateVersion: 1,
        positionMm: { x: 2800, y: 1500 },
        widthMm: 780,
        lengthMm: 1180,
        minPitchDeg: 15,
        maxPitchDeg: 90,
      },
    ],
  };
};

/**
 * The attic: a re-identified copy of `first` above it at the suggested elevation, under its roof. Its walls keep the
 * First floor's heights; the roof clips them under the slopes and raises them to the ridge at the east gable. The
 * copied doors and windows that would poke through the roof are lowered to fit under it where they can (as placing
 * them does) and left out where they cannot (a window in a 1000 mm knee wall); objects and lights above the roof are
 * left out, so the demo shows no item above the roof.
 */
export const familyAttic = (
  first: BuildingFloorValue,
  house: Pick<HouseDocument, "defaultWallHeightMm">,
): BuildingFloorValue => {
  const copy = reidentifiedFloor(first);
  const roof = familyAtticRoof();
  const attic: BuildingFloorValue = {
    ...copy,
    name: "Attic",
    elevationMm: suggestedElevationAboveMm(first, house),
    roofs: [roof],
  };
  const above = new Set(itemsAboveRoof(attic, openingSizeFromParameters));
  return {
    ...attic,
    areas: attic.areas.map((area) => ({
      ...area,
      walls: area.walls.map((wall) => ({
        ...wall,
        objects: wall.objects.flatMap((opening) => {
          const size = openingSizeFromParameters(opening);
          if (!above.has(opening.id) || size === null) return [opening];
          const limit = wallItemTopLimitMm(
            attic,
            area.id,
            wall.id,
            opening.placement.distanceAlongWallMm,
            size.widthMm,
          );
          const fit = fitUnderRoof(opening.placement.bottomMm, size.heightMm, limit);
          return fit.kind === "lowered"
            ? [{ ...opening, placement: { ...opening.placement, bottomMm: fit.bottomMm } }]
            : fit.kind === "fits"
              ? [opening]
              : [];
        }),
      })),
      objects: area.objects.filter((object) => !above.has(object.id)),
      lights: area.lights.filter((light) => !above.has(light.id)),
    })),
  };
};
