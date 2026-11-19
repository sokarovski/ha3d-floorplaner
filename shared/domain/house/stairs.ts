// Stairs and floor openings (Phase 16.14, spec/builder/features/staircase-areas.md): objects whose `floorCut` tag
// makes the derived step cut floors. The rise of a new stair is suggested once from the gap to the next floor above.
import type { AreableInstanceValue } from "../schemas/instances";
import type { HouseDocument } from "../schemas/house";
import { floorCutParameters } from "../templates/metadata";
import { floorPlacementOf, floorsByElevation } from "./floorPlacement";

/** A stair's Cut floor above (absent = on). */
export const cutsFloorAbove = (object: Pick<AreableInstanceValue, "floorCut" | "cutFloorAbove">): boolean =>
  object.floorCut === "stair" && object.cutFloorAbove !== false;

/** A stair's Cut floor below (absent = off); a floor opening always cuts its own floor. */
export const cutsOwnFloor = (object: Pick<AreableInstanceValue, "floorCut" | "cutFloorBelow">): boolean =>
  object.floorCut === "opening" || (object.floorCut === "stair" && object.cutFloorBelow === true);

const positiveParameter = (object: Pick<AreableInstanceValue, "parameters">, name: string): number | null => {
  const value = object.parameters[name];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
};

/** The plan size of a floor-cutting object (template x × z), or null when its parameters lack it. */
export const floorCutSizeMm = (
  object: Pick<AreableInstanceValue, "parameters">,
): Readonly<{ widthMm: number; depthMm: number }> | null => {
  const widthMm = positiveParameter(object, floorCutParameters.x);
  const depthMm = positiveParameter(object, floorCutParameters.z);
  return widthMm === null || depthMm === null ? null : { widthMm, depthMm };
};

/** A stair's rise (its total rise parameter), or 0 when absent. */
export const stairRiseMm = (object: Pick<AreableInstanceValue, "parameters">): number =>
  positiveParameter(object, floorCutParameters.y) ?? 0;

/**
 * The suggested rise of a new stair on `floorId` (owner, Phase 16.14): the gap from its finished floor to the next
 * floor above (by elevation, ties skipped), clamped to the template's limits; `fallbackMm` without a floor above.
 */
export const stairRiseSuggestionMm = (
  house: Pick<HouseDocument, "floors">,
  floorId: string,
  limits: Readonly<{ minMm?: number; maxMm?: number }>,
  fallbackMm: number,
): number => {
  const floor = house.floors.find((candidate) => candidate.id === floorId);
  if (floor === undefined) return fallbackMm;
  const elevation = floorPlacementOf(floor).elevationMm;
  const above = floorsByElevation(house.floors).find(
    (candidate) => floorPlacementOf(candidate).elevationMm > elevation + 1,
  );
  if (above === undefined) return fallbackMm;
  const gap = floorPlacementOf(above).elevationMm - elevation;
  return Math.min(limits.maxMm ?? gap, Math.max(limits.minMm ?? gap, Math.round(gap)));
};
