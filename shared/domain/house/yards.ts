// Yards (Phase 17.2, owner 2026-11-18; spec/builder/features/yards.md): an area with `kind: "yard"`, created only
// by Add yard on the ground floor. It is outdoors: its floor is lawn (built-in Lawn by default, changeable like any
// flooring), its walls are drawn as fences of the yard's fence style (a built-in glTF template whose posts and
// boards repeat along each wall), doors on its walls are gates, it has no slab and no shadow-only ceiling.
// Pathways are carpets in a yard, starting with the built-in Paving.
import { createId } from "../ids";
import type { AreaValue, FenceStyle } from "../schemas/area";
import type { BuildingFloorValue } from "../schemas/floor";
import type { CarpetValue } from "../schemas/carpet";
import type { SurfaceMaterialValue } from "../schemas/values";
import { builtInTexturedMaterial, findBuiltInImage } from "./builtinMaterials";
import { createWall, defaultWallPaint } from "./defaults";
import { floorsByElevation } from "./floorPlacement";

export const isYard = (area: Pick<AreaValue, "kind">): boolean => area.kind === "yard";

/** The yard's fence style; absent reads as picket. */
export const fenceStyleOf = (area: Pick<AreaValue, "fence">): FenceStyle => area.fence ?? "picket";

/** The built-in fence template of each style (scripts/templates/fences.ts), version 1. */
export const fenceTemplates: Readonly<Record<FenceStyle, string>> = {
  picket: "fence-picket",
  panel: "fence-panel",
  hedge: "fence-hedge",
  slatted: "fence-slatted",
  trellis: "fence-trellis",
  wire: "fence-wire",
};
export const fenceTemplateVersion = 1;

/** Template kinds: a fence segment (never offered by a picker) and a gate (the Gate picker on a yard's walls). */
export const fenceKind = "fence";
export const gateKind = "gate";

/** Defaults of a new yard (implementation conventions). */
export const yardDefaults = {
  widthMm: 8000,
  depthMm: 6000,
  /** Fence wall height = fence height. */
  fenceHeightMm: 1000,
  /** Fence wall thickness: the band the fence stands in, inside the yard outline. */
  fenceThicknessMm: 100,
  /** A pathway rectangle. */
  pathWidthMm: 1200,
  pathLengthMm: 4000,
} as const;

/** Fence segments shorter than this (mm) are not drawn (a sliver between a gate and a corner). */
export const minFenceSegmentMm = 50;

/**
 * The ground floor: the lowest building floor by elevation (ties: the first in the document), the only floor that
 * offers Add yard.
 */
export const groundFloorOf = <T extends Pick<BuildingFloorValue, "id" | "positionMm" | "elevationMm">>(
  floors: readonly T[],
): T | undefined => floorsByElevation(floors)[0];

const builtInMaterial = (imageId: string): SurfaceMaterialValue => {
  const texture = findBuiltInImage(imageId);
  if (texture === undefined) throw new Error(`Unknown built-in texture ${imageId}`);
  return builtInTexturedMaterial(texture);
};

/** The built-in Lawn (a new yard's flooring) and Paving (a new pathway). */
export const lawnMaterial = (): SurfaceMaterialValue => builtInMaterial("builtinimg_lawngrass");
export const pavingMaterial = (): SurfaceMaterialValue => builtInMaterial("builtinimg_paving");

/** Rectangle edges in counter-clockwise order (shapeOutline.ts). */
export type RectangleEdge = "bottom" | "right" | "top" | "left";

/**
 * A new yard: one `widthMm` × `depthMm` rectangle centred on `centerMm` (floor frame), Lawn flooring, and one
 * fence wall (1000 mm high, 100 mm, inside-aligned) on every edge except `openEdges` (the edge against the house).
 */
export const createYard = (
  name: string,
  centerMm: Readonly<{ x: number; y: number }>,
  options: Readonly<{
    widthMm?: number;
    depthMm?: number;
    fence?: FenceStyle;
    openEdges?: readonly RectangleEdge[];
  }> = {},
): AreaValue => {
  const shapeId = createId("s");
  const open = new Set(options.openEdges ?? []);
  const edges: readonly RectangleEdge[] = ["bottom", "right", "top", "left"];
  return {
    id: createId("a"),
    kind: "yard",
    name,
    fence: options.fence ?? "picket",
    positionMm: { x: Math.round(centerMm.x), y: Math.round(centerMm.y) },
    rotationDeg: 0,
    floor: {
      id: createId("fs"),
      material: lawnMaterial(),
      shapes: [
        {
          id: shapeId,
          type: "rectangle",
          positionMm: { x: 0, y: 0 },
          rotationDeg: 0,
          widthMm: options.widthMm ?? yardDefaults.widthMm,
          heightMm: options.depthMm ?? yardDefaults.depthMm,
        },
      ],
      carpets: [],
    },
    walls: edges
      .filter((edge) => !open.has(edge))
      .map((edge) => ({
        ...createWall(shapeId, edge, yardDefaults.fenceHeightMm),
        thicknessMm: yardDefaults.fenceThicknessMm,
        alignment: "inside",
        materials: { interior: defaultWallPaint(), exterior: defaultWallPaint() },
      })),
    objects: [],
    lights: [],
  };
};

/** A pathway: a carpet of built-in Paving, `pathWidthMm` × `pathLengthMm`, at `centerMm` (area frame). */
export const createPathway = (name: string, centerMm: Readonly<{ x: number; y: number }>): CarpetValue => ({
  id: createId("c"),
  name,
  positionMm: { x: Math.round(centerMm.x), y: Math.round(centerMm.y) },
  rotationDeg: 0,
  material: pavingMaterial(),
  shapes: [
    {
      id: createId("s"),
      type: "rectangle",
      positionMm: { x: 0, y: 0 },
      rotationDeg: 0,
      widthMm: yardDefaults.pathWidthMm,
      heightMm: yardDefaults.pathLengthMm,
    },
  ],
});
