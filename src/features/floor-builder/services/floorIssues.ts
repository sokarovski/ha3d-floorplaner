// Collects geometry flags for the active floor: orphaned walls, intrusions, openings that don't fit, conflicts,
// and items above the roof.
import { buildRealAllWalls } from "@shared/geometry/realAllWalls";
import type { WallGeometryIssue } from "@shared/geometry/realAllWallsTypes";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { HouseDocument } from "@shared/domain/schemas/house";
import { openingSizeFromParameters } from "@shared/domain/templates/openingSize";
import { itemsAboveRoof } from "@shared/geometry/roofItems";
import type { RoofItemIssue } from "@shared/geometry/roofOpenings";
import { roofItemIssues } from "@shared/geometry/roofOpenings";
import { roofsOf } from "@shared/domain/house/roofs";
import type { TreeIssues } from "./houseTree";

const empty: TreeIssues = { orphanWallIds: new Set(), flaggedIds: new Set() };

export const floorGeometryIssues = (house: HouseDocument, floorId: string): readonly WallGeometryIssue[] => {
  const floor = house.floors.find((candidate) => candidate.id === floorId);
  return floor === undefined ? [] : buildRealAllWalls(floor, openingSizeFromParameters).issues;
};

const aboveCache = new WeakMap<BuildingFloorValue, readonly string[]>();

/**
 * Items above the floor's roof (Phase 19.2): doors and windows, wall-mounted objects, objects (stairs included) and
 * lights whose top is above the underside (flagged, never moved).
 */
export const itemsAboveRoofOf = (house: HouseDocument, floorId: string): readonly string[] => {
  const floor = house.floors.find((candidate) => candidate.id === floorId);
  if (floor === undefined) return [];
  const cached = aboveCache.get(floor);
  if (cached !== undefined) return cached;
  const above = itemsAboveRoof(floor, openingSizeFromParameters);
  aboveCache.set(floor, above);
  return above;
};

const roofIssueCache = new WeakMap<BuildingFloorValue, readonly RoofItemIssue[]>();

/**
 * Holes and roof windows that no longer fit (Phase 19.3): outside the roof, crossed by a break or fold line, or on a
 * slope outside the window's limits (never deleted or moved, only flagged).
 */
export const roofIssuesOf = (house: HouseDocument, floorId: string): readonly RoofItemIssue[] => {
  const floor = house.floors.find((candidate) => candidate.id === floorId);
  if (floor === undefined) return [];
  const cached = roofIssueCache.get(floor);
  if (cached !== undefined) return cached;
  const issues = roofsOf(floor).flatMap((roof) => roofItemIssues(roof));
  roofIssueCache.set(floor, issues);
  return issues;
};

export const collectIssues = (house: HouseDocument, floorId: string): TreeIssues => {
  const issues = floorGeometryIssues(house, floorId);
  const above = itemsAboveRoofOf(house, floorId);
  // Roof items are flagged on every floor (the whole house lists every floor's roofs).
  const roofItems = house.floors.flatMap((floor) => roofIssuesOf(house, floor.id));
  if (issues.length === 0 && above.length === 0 && roofItems.length === 0) return empty;
  const orphanWallIds = new Set<string>();
  const flaggedIds = new Set<string>();
  for (const issue of issues) {
    if (issue.kind === "orphanWall") orphanWallIds.add(issue.wallId);
    else if (issue.kind === "intrusion") flaggedIds.add(issue.wallId);
    else if (issue.kind === "openingDoesNotFit" || issue.kind === "openingUnsized")
      flaggedIds.add(issue.openingId);
    else if (issue.kind === "openingConflict") for (const id of issue.openingIds) flaggedIds.add(id);
    else if (
      issue.kind === "reliefDoesNotFit" ||
      issue.kind === "reliefOnCurvedWall" ||
      issue.kind === "reliefTooDeep"
    )
      flaggedIds.add(issue.reliefId);
    else for (const id of issue.wallIds) flaggedIds.add(id);
  }
  for (const id of above) flaggedIds.add(id);
  for (const issue of roofItems) {
    flaggedIds.add(issue.id);
    flaggedIds.add(issue.roofId);
  }
  return { orphanWallIds, flaggedIds };
};

export const describeIssue = (issue: WallGeometryIssue): string => {
  switch (issue.kind) {
    case "orphanWall":
      return "This wall's edge is no longer on the floor boundary. Reassign or delete it.";
    case "intrusion":
      return "This wall pokes into another room. Use “Snap to shared wall” to fix it.";
    case "reliefDoesNotFit":
      return "This box or niche does not fit on its wall (past an end, below the floor, or above the top).";
    case "reliefOnCurvedWall":
      return "Boxes and niches on curved walls are not supported yet; it is not drawn.";
    case "reliefTooDeep":
      return "This niche is deeper than the wall allows; it is drawn leaving 20 mm of wall behind it.";
    case "ambiguousOwnership":
      return "Two rooms claim the same wall face here.";
    case "openingDoesNotFit":
      return "This opening no longer fits its wall and is not cut.";
    case "openingUnsized":
      return "This opening has no width or height.";
    case "openingConflict":
      return "Two openings overlap from both sides of a shared wall.";
  }
};
