// Holes and roof windows on a roof (Phase 19.3, spec/builder/features/roofs.md#holes-and-roof-windows). Both are
// stored on the 2D roof sheet (plan, floor frame), never in 3D (owner, phase-19.md): their height always comes from
// the surface under them, so they can never hang in thin air, and after a line edit they stay where they were, on
// whichever face is under them. This module derives, never stores:
// - each flat piece's face frame (u level along the slope's contour, v up the slope's surface, mm), the frame the
//   face view draws in;
// - where each hole and roof window cuts the roof, and whether it still fits (owner rules: on one face → drawn
//   normally, following the new slope; outside the outline → not drawn, an issue; a roof window crossed by a break
//   or fold line → its hole is cut on both faces, the window is not drawn, an issue; a slope outside the window's
//   template limits → not drawn, an issue). Nothing is ever deleted or moved automatically.
// A hole does not change the walls' roof limit (roofLimit.ts reads the surface, holes included or not: the limit is
// the underside the roof would have there), so a wall under a skylight keeps its height (decision 19.3).
// Pure and framework-free, memoized by the roof value.
import { DraftSafeWeakMap } from "./draftSafeWeakMap";
import type { RoofHoleValue, RoofValue, RoofWindowValue } from "../domain/schemas/roof";
import type { Vec3 } from "./meshData";
import { differenceRegions, intersectRegions, unionRegions, unionRings } from "./polygonKernel";
import type { Region, Ring } from "./region";
import { pointInRegion, regionArea, regionBounds } from "./region";
import type { RoofPiece, RoofPlane, RoofSurface } from "./roofSurface";
import { planeHeight, roofSurface } from "./roofSurface";
import type { Vec2 } from "./vector";

/** Below this plan slope a piece counts as flat (its face frame is plan x/y). */
const flatSlope = 1e-4;
/** Area slack when testing that a window lies on one piece (mm²; implementation convention). */
const areaSlackMm2 = 50;

/** A flat piece's face frame: plan origin, level and up-slope plan directions, and the slope's stretch. */
export type RoofFaceFrame = Readonly<{
  origin: Vec2;
  /** Unit plan direction along the contour (level). */
  along: Vec2;
  /** Unit plan direction up the slope (plan y for a flat piece). */
  up: Vec2;
  /** Surface length per plan length up the slope: √(1 + slope²). */
  stretch: number;
  plane: RoofPlane;
  /** The pitch in degrees. */
  pitchDeg: number;
}>;

export const faceFrameOf = (plane: RoofPlane, origin: Vec2): RoofFaceFrame => {
  const slope = Math.hypot(plane.ax, plane.ay);
  const pitchDeg = (Math.atan(slope) * 180) / Math.PI;
  if (slope < flatSlope)
    return { origin, along: { x: 1, y: 0 }, up: { x: 0, y: 1 }, stretch: 1, plane, pitchDeg: 0 };
  const up = { x: plane.ax / slope, y: plane.ay / slope };
  return {
    origin,
    along: { x: up.y, y: -up.x },
    up,
    stretch: Math.sqrt(1 + slope * slope),
    plane,
    pitchDeg,
  };
};

/** Plan point → face coordinates (u along, v up the surface). */
export const toFace = (frame: RoofFaceFrame, point: Vec2): Vec2 => {
  const dx = point.x - frame.origin.x;
  const dy = point.y - frame.origin.y;
  return {
    x: dx * frame.along.x + dy * frame.along.y,
    y: (dx * frame.up.x + dy * frame.up.y) * frame.stretch,
  };
};

/** Face coordinates → plan point (projected vertically from the slope onto the plan). */
export const fromFace = (frame: RoofFaceFrame, point: Vec2): Vec2 => {
  const v = point.y / frame.stretch;
  return {
    x: frame.origin.x + frame.along.x * point.x + frame.up.x * v,
    y: frame.origin.y + frame.along.y * point.x + frame.up.y * v,
  };
};

/** A unit vector in plan axes (x, y, h). */
const unit3 = (v: Vec3): Vec3 => {
  const length = Math.hypot(v.x, v.y, v.h) || 1;
  return { x: v.x / length, y: v.y / length, h: v.h / length };
};

/** The face's 3D axes (floor frame): level along the contour, up the slope, and the outward (upper) normal. */
export const faceAxes = (frame: RoofFaceFrame): Readonly<{ along: Vec3; up: Vec3; normal: Vec3 }> => {
  const along: Vec3 = { x: frame.along.x, y: frame.along.y, h: 0 };
  const slope = Math.hypot(frame.plane.ax, frame.plane.ay);
  const up = unit3({ x: frame.up.x, y: frame.up.y, h: slope < flatSlope ? 0 : slope });
  // normal = along × up (right-handed: along, up, normal).
  const normal = unit3({
    x: along.y * up.h - along.h * up.y,
    y: along.h * up.x - along.x * up.h,
    h: along.x * up.y - along.y * up.x,
  });
  return { along, up, normal };
};

const pieceRegionCache = new DraftSafeWeakMap<RoofPiece, Region>();

/** A piece's plan region (the union of its triangles). */
export const pieceRegion = (piece: RoofPiece): Region => {
  const cached = pieceRegionCache.get(piece);
  if (cached !== undefined) return cached;
  const region = unionRings(
    piece.triangles.map(([a, b, c]) => [
      { x: a.x, y: a.y },
      { x: b.x, y: b.y },
      { x: c.x, y: c.y },
    ]),
    { closeContacts: false },
  );
  pieceRegionCache.set(piece, region);
  return region;
};

/** The piece under a plan point (its index in surface.pieces), or -1. */
export const pieceIndexAt = (surface: RoofSurface, point: Vec2): number =>
  surface.pieces.findIndex((piece) => pointInRegion(point, pieceRegion(piece)));

/** The face frame of a piece, its origin at the piece's plan centre. */
export const pieceFrame = (piece: RoofPiece): RoofFaceFrame => {
  const bounds = regionBounds(pieceRegion(piece));
  return faceFrameOf(piece.plane, { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 });
};

export type RoofItemFit = "fits" | "outside" | "crossed" | "pitch";

export type PlacedRoofWindow = Readonly<{
  window: RoofWindowValue;
  fit: RoofItemFit;
  /** The piece under its centre (-1 outside). */
  pieceIndex: number;
  /** Its frame on that piece (origin at the window's centre), or null outside. */
  frame: RoofFaceFrame | null;
  /** Its rectangle in plan (the hole it cuts). */
  ring: Ring;
}>;

export type PlacedRoofHole = Readonly<{ hole: RoofHoleValue; fit: "fits" | "outside"; region: Region }>;

export type RoofOpenings = Readonly<{
  holes: readonly PlacedRoofHole[];
  windows: readonly PlacedRoofWindow[];
  /** Everything cut out of the roof, in plan (inside the outline). */
  cut: Region;
}>;

const coverageCache = new DraftSafeWeakMap<RoofSurface, Region>();

/** The roof's plan coverage (its pieces' union). */
export const surfaceCoverage = (surface: RoofSurface): Region => {
  const cached = coverageCache.get(surface);
  if (cached !== undefined) return cached;
  const coverage = unionRegions(surface.pieces.map(pieceRegion), { closeContacts: false });
  coverageCache.set(surface, coverage);
  return coverage;
};

/** A roof window's rectangle (plan) on a frame whose origin is its centre. */
export const roofWindowRing = (frame: RoofFaceFrame, widthMm: number, lengthMm: number): Ring => {
  const w = widthMm / 2;
  const l = lengthMm / 2;
  return [
    fromFace(frame, { x: -w, y: -l }),
    fromFace(frame, { x: w, y: -l }),
    fromFace(frame, { x: w, y: l }),
    fromFace(frame, { x: -w, y: l }),
  ];
};

/** Where a roof window sits and whether it fits (the owner's no-fit rules). */
export const placeRoofWindow = (surface: RoofSurface, window: RoofWindowValue): PlacedRoofWindow => {
  const centre = window.positionMm;
  const pieceIndex = pieceIndexAt(surface, centre);
  const piece = surface.pieces[pieceIndex];
  if (piece === undefined) {
    const half = { x: window.widthMm / 2, y: window.lengthMm / 2 };
    return {
      window,
      fit: "outside",
      pieceIndex: -1,
      frame: null,
      ring: [
        { x: centre.x - half.x, y: centre.y - half.y },
        { x: centre.x + half.x, y: centre.y - half.y },
        { x: centre.x + half.x, y: centre.y + half.y },
        { x: centre.x - half.x, y: centre.y + half.y },
      ],
    };
  }
  const frame = faceFrameOf(piece.plane, centre);
  const ring = roofWindowRing(frame, window.widthMm, window.lengthMm);
  const rect = unionRings([ring], { closeContacts: false });
  const area = regionArea(rect);
  const onRoof = regionArea(intersectRegions(rect, surfaceCoverage(surface)));
  if (onRoof < area - areaSlackMm2) return { window, fit: "outside", pieceIndex, frame, ring };
  const onPiece = regionArea(intersectRegions(rect, pieceRegion(piece)));
  if (onPiece < area - areaSlackMm2) return { window, fit: "crossed", pieceIndex, frame, ring };
  if (frame.pitchDeg < window.minPitchDeg - 0.05 || frame.pitchDeg > window.maxPitchDeg + 0.05)
    return { window, fit: "pitch", pieceIndex, frame, ring };
  return { window, fit: "fits", pieceIndex, frame, ring };
};

const openingsCache = new DraftSafeWeakMap<RoofValue, RoofOpenings>();

/** The roof's holes and windows placed on its surface, and the region they cut (memoized by the roof value). */
export const roofOpenings = (roof: RoofValue, surface: RoofSurface = roofSurface(roof)): RoofOpenings => {
  const cached = openingsCache.get(roof);
  if (cached !== undefined) return cached;
  const coverage = surfaceCoverage(surface);
  const holes = (roof.holes ?? []).map((hole): PlacedRoofHole => {
    const region = intersectRegions(unionRings([hole.points], { closeContacts: false }), coverage);
    return { hole, fit: region.polygons.length === 0 ? "outside" : "fits", region };
  });
  const windows = (roof.windows ?? []).map((window) => placeRoofWindow(surface, window));
  // A crossed window's hole is still cut on both faces; an outside or wrong-pitch window cuts nothing.
  const cutRegions = [
    ...holes.flatMap((placed) => (placed.fit === "fits" ? [placed.region] : [])),
    ...windows.flatMap((placed) =>
      placed.fit === "fits" || placed.fit === "crossed"
        ? [intersectRegions(unionRings([placed.ring], { closeContacts: false }), coverage)]
        : [],
    ),
  ];
  const result: RoofOpenings = {
    holes,
    windows,
    cut: cutRegions.length === 0 ? { polygons: [] } : unionRegions(cutRegions, { closeContacts: false }),
  };
  openingsCache.set(roof, result);
  return result;
};

/** A piece's plan region minus the roof's cut (what is left to draw). */
export const pieceRegionLeft = (piece: RoofPiece, cut: Region): Region =>
  cut.polygons.length === 0 ? pieceRegion(piece) : differenceRegions(pieceRegion(piece), cut);

/** The height of a piece's top over a plan point (above the floor). */
export const pieceTopAt = (
  roof: Pick<RoofValue, "eaveHeightMm" | "thicknessMm">,
  plane: RoofPlane,
  point: Vec2,
): number => roof.eaveHeightMm + planeHeight(plane, point) + roof.thicknessMm;

export type RoofItemIssue = Readonly<{ id: string; roofId: string; message: string }>;

const windowMessage = (placed: PlacedRoofWindow): string | null => {
  const name = placed.window.name;
  switch (placed.fit) {
    case "fits":
      return null;
    case "outside":
      return `${name} is outside the roof; it is not drawn. Move it back onto a roof face.`;
    case "crossed":
      return `${name} is crossed by a break or fold line; its hole is cut but the window is not drawn. Move it onto one face.`;
    case "pitch":
      return `${name} does not suit this slope (${String(Math.round(placed.frame?.pitchDeg ?? 0))}°, allowed ${String(placed.window.minPitchDeg)}–${String(placed.window.maxPitchDeg)}°); it is not drawn.`;
  }
};

/** Issues of a roof's holes and windows that no longer fit (never deleted or moved, only flagged). */
export const roofItemIssues = (roof: RoofValue): readonly RoofItemIssue[] => {
  const openings = roofOpenings(roof);
  return [
    ...openings.holes.flatMap((placed) =>
      placed.fit === "outside"
        ? [
            {
              id: placed.hole.id,
              roofId: roof.id,
              message: `${placed.hole.name} is outside the roof; it cuts nothing. Move it back onto the roof.`,
            },
          ]
        : [],
    ),
    ...openings.windows.flatMap((placed) => {
      const message = windowMessage(placed);
      return message === null ? [] : [{ id: placed.window.id, roofId: roof.id, message }];
    }),
  ];
};

/**
 * Where a new roof window goes when no point is given (the roof's + menu): the centre of the largest flat piece
 * whose pitch suits the template, else of the largest piece; null for a roof without faces.
 */
export const roofWindowSpot = (roof: RoofValue, minPitchDeg: number, maxPitchDeg: number): Vec2 | null => {
  const surface = roofSurface(roof);
  const ranked = surface.pieces
    .map((piece) => ({ piece, area: regionArea(pieceRegion(piece)), frame: pieceFrame(piece) }))
    .sort((a, b) => b.area - a.area);
  const suited = ranked.find(
    (entry) => entry.frame.pitchDeg >= minPitchDeg - 0.05 && entry.frame.pitchDeg <= maxPitchDeg + 0.05,
  );
  const chosen = suited ?? ranked[0];
  if (chosen === undefined) return null;
  // The piece's bounding-box centre may lie outside a non-convex piece: fall back to a triangle's centroid.
  const centre = chosen.frame.origin;
  if (pointInRegion(centre, pieceRegion(chosen.piece))) return centre;
  const [a, b, c] = chosen.piece.triangles[0] ?? [];
  return a === undefined || b === undefined || c === undefined
    ? centre
    : { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
};
