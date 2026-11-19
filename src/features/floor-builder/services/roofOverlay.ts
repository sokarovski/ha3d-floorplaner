// Roof overlays (Phase 19.1, spec/builder/features/roofs.md#the-roof-editing-level). In the roof's editing level
// (floor frame): its outline, break lines (solid), auto-fold lines (dashed), lines that split no face (dashed
// warning) and every pullable point (a dot; selected points and lines in the selection tone), drawn on the roof's
// top so they stay visible over it. In the whole-house overview (house frame): a hovered or selected roof's outline
// and lines. Phase 19.3: step lines (both sides), and the roof's holes and roof windows on its top (selected ones in
// the selection tone, ones that no longer fit dashed in the warning tone).
import { indexEntities } from "@shared/domain/house/entityIndex";
import { roofsOf } from "@shared/domain/house/roofs";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { RoofValue } from "@shared/domain/schemas/roof";
import { floorToHouseOffset } from "@shared/geometry/placement";
import type { Vec3 } from "@shared/geometry/meshData";
import { roofOpenings } from "@shared/geometry/roofOpenings";
import type { Ring } from "@shared/geometry/region";
import { roofHeightAt, roofSurface } from "@shared/geometry/roofSurface";
import type { OverlayPrimitive, OverlayTone, PlanPoint3 } from "../../../renderer/runtimeTypes";

/** Overlays sit just above the roof's top (mm) so the roof does not hide them. */
const liftMm = 6;

/**
 * Line widths (CSS px, Phase 19.5 owner: "thicker roof lines and hole outlines", implementation convention): the
 * outline, break and step lines; fold lines (dashed); hole and roof-window outlines; a selected one (bold).
 */
export const roofLineWidthPx = 3;
export const roofFoldWidthPx = 2;
export const roofItemWidthPx = 2;
export const roofSelectedItemWidthPx = 4;

const onTop = (roof: RoofValue, point: Vec3, offset: PlanPoint3): PlanPoint3 => ({
  x: point.x + offset.x,
  y: point.y + offset.y,
  h: roof.eaveHeightMm + point.h + roof.thicknessMm + liftMm + offset.h,
});

/** The roof's outline and break lines (and folds), in one tone. */
export const roofLinesOverlay = (
  roof: RoofValue,
  tone: OverlayTone,
  offset: PlanPoint3 = { x: 0, y: 0, h: 0 },
): OverlayPrimitive[] => {
  const surface = roofSurface(roof);
  return [
    {
      kind: "polyline",
      points: surface.rim.map((segment) => onTop(roof, segment.a, offset)),
      closed: true,
      tone,
      widthPx: roofLineWidthPx,
    },
    // Step lines (19.3): the low and the raised side.
    ...surface.steps.flatMap((step): OverlayPrimitive[] =>
      [step.low, step.high].map((segment) => ({
        kind: "segment",
        from: onTop(roof, segment.a, offset),
        to: onTop(roof, segment.b, offset),
        tone,
        widthPx: roofLineWidthPx,
      })),
    ),
    ...surface.breaks.map((segment): OverlayPrimitive => ({
      kind: "segment",
      from: onTop(roof, segment.a, offset),
      to: onTop(roof, segment.b, offset),
      tone,
      widthPx: roofLineWidthPx,
    })),
    ...surface.folds.map((segment): OverlayPrimitive => ({
      kind: "segment",
      from: onTop(roof, segment.a, offset),
      to: onTop(roof, segment.b, offset),
      tone,
      dashed: true,
      widthPx: roofFoldWidthPx,
    })),
  ];
};

/** Pieces per ring edge when an item's outline is laid on the roof's top (it may cross a fold). */
const itemEdgeSteps = 8;

/** A plan ring laid on the roof's top (each edge subdivided so it follows the faces it crosses). */
const ringOnTop = (roof: RoofValue, ring: Ring): PlanPoint3[] => {
  const surface = roofSurface(roof);
  return ring.flatMap((a, index) => {
    const b = ring[(index + 1) % ring.length] ?? a;
    return Array.from({ length: itemEdgeSteps }, (_, k) => {
      const t = k / itemEdgeSteps;
      const point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      return onTop(roof, { ...point, h: roofHeightAt(surface, point) ?? 0 }, { x: 0, y: 0, h: 0 });
    });
  });
};

/** The roof's holes and roof windows (19.3): selected ones strong, ones that no longer fit dashed as warnings. */
export const roofItemsOverlay = (roof: RoofValue, selection: readonly string[]): OverlayPrimitive[] => {
  const selected = new Set(selection);
  const openings = roofOpenings(roof);
  const outline = (id: string, ring: Ring, fits: boolean): OverlayPrimitive => ({
    kind: "polyline",
    points: ringOnTop(roof, ring),
    closed: true,
    tone: selected.has(id) ? "accentStrong" : fits ? "accent" : "warning",
    widthPx: selected.has(id) ? roofSelectedItemWidthPx : roofItemWidthPx,
    ...(fits ? {} : { dashed: true }),
  });
  return [
    ...openings.holes.map((placed) => outline(placed.hole.id, placed.hole.points, placed.fit === "fits")),
    ...openings.windows.map((placed) => outline(placed.window.id, placed.ring, placed.fit === "fits")),
  ];
};

/** The open roof's sheet: lines, folds, loose lines, and its points, with the selection drawn strong. */
export const roofEditOverlay = (
  floor: BuildingFloorValue | undefined,
  roofId: string,
  selection: readonly string[],
): OverlayPrimitive[] => {
  const roof = floor === undefined ? undefined : roofsOf(floor).find((candidate) => candidate.id === roofId);
  if (roof === undefined) return [];
  const surface = roofSurface(roof);
  const origin = { x: 0, y: 0, h: 0 };
  const selected = new Set(selection);
  const byId = new Map(roof.points.map((point) => [point.id, point]));
  const at = (id: string): PlanPoint3 | undefined => {
    const point = byId.get(id);
    return point === undefined
      ? undefined
      : onTop(roof, { x: point.x, y: point.y, h: point.heightMm }, origin);
  };
  const loose = new Set(surface.looseLineIds);
  const lines = roof.lines.flatMap((line): OverlayPrimitive[] => {
    const a = at(line.a);
    const b = at(line.b);
    if (a === undefined || b === undefined) return [];
    if (selected.has(line.id))
      return [{ kind: "segment", from: a, to: b, tone: "accentStrong", widthPx: roofSelectedItemWidthPx }];
    if (loose.has(line.id))
      return [{ kind: "segment", from: a, to: b, tone: "warning", dashed: true, widthPx: roofFoldWidthPx }];
    return [];
  });
  const points = roof.points.map((point): OverlayPrimitive => ({
    kind: "point",
    at: onTop(roof, { x: point.x, y: point.y, h: point.heightMm }, origin),
    marker: selected.has(point.id) ? "dotBold" : "dot",
    tone: selected.has(point.id) ? "accentStrong" : "accent",
  }));
  return [...roofLinesOverlay(roof, "accent"), ...lines, ...points, ...roofItemsOverlay(roof, selection)];
};

/** Selected roofs in the whole-house overview (house frame). */
export const selectedRoofsOverlay = (
  house: HouseDocument,
  selection: readonly string[],
): OverlayPrimitive[] => {
  const entities = indexEntities(house);
  return selection.flatMap((id) => {
    const ref = entities.get(id);
    if (ref?.kind !== "roof") return [];
    const floor = house.floors.find((candidate) => candidate.id === ref.floorId);
    return floor === undefined ? [] : roofLinesOverlay(ref.value, "accentStrong", floorToHouseOffset(floor));
  });
};

/** A hovered roof in the whole-house overview, unless it is selected. */
export const hoveredRoofOverlay = (
  house: HouseDocument,
  roofId: string | undefined,
  selection: readonly string[],
): OverlayPrimitive[] => {
  if (roofId === undefined || selection.includes(roofId)) return [];
  return selectedRoofsOverlay(house, [roofId]).map((primitive) =>
    "tone" in primitive ? { ...primitive, tone: "accent" } : primitive,
  );
};

/** A floor view's selected canopies (19.3, attached roofs drawn there), in the floor frame. */
export const selectedCanopiesOverlay = (
  floor: BuildingFloorValue | undefined,
  selection: readonly string[],
): OverlayPrimitive[] =>
  floor === undefined
    ? []
    : roofsOf(floor)
        .filter((roof) => !roof.cutsWalls && selection.includes(roof.id))
        .flatMap((roof) => roofLinesOverlay(roof, "accentStrong"));
