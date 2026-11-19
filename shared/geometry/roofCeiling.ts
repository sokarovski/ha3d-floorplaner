// The shadow-only ceiling of a room under a cutting roof (Phase 19.3 fix, spec/architecture/renderer.md#roofs).
// Phase 15.5 gives every room an invisible, shadow-casting ceiling at its tallest authored wall. Under a roof whose
// eave is lower than that (the demo attic: eave 720 mm, walls 2700 mm), the flat ceiling pokes up through the
// slopes: invisible, but still casting a shadow onto the roof's own top, which read as a soft darker band along the
// eaves (identical with Walls rise on or off, since the ceiling reads the authored heights). Under the roof the
// ceiling therefore follows min(ceiling height, underside): each roof piece over the room is split along the
// contour where its underside equals the ceiling height; below it the patch lies on the underside (the walls are
// clipped there anyway), above it the patch stays flat at the ceiling height; outside the roof the ceiling is flat
// as before. The ceiling never reaches above the roof's underside, so it never shades the roof's top. Pure and
// framework-free; the renderer builds the patches into its shadow-only mesh.
import { differenceRegions, intersectRegions, regionFromRings } from "./polygonKernel";
import type { Region, Ring } from "./region";
import { regionBounds } from "./region";
import type { Linear2, RoofLimit } from "./roofLimit";

/** A piece of a ceiling: its plan region and the height plane over it (above the floor, mm). */
export type CeilingPatch = Readonly<{ region: Region; plane: Linear2 }>;

const flatAt = (heightMm: number): Linear2 => ({ c: heightMm, ax: 0, ay: 0 });

/** Below this slope (mm per mm) a plane counts as level. */
const levelSlope = 1e-9;

/** The convex half of a rectangle where `plane` is below `heightMm` (Sutherland–Hodgman on one line). */
const belowHalf = (region: Region, plane: Linear2, heightMm: number): Ring => {
  const bounds = regionBounds(region);
  const margin = 10;
  const box: Ring = [
    { x: bounds.minX - margin, y: bounds.minY - margin },
    { x: bounds.maxX + margin, y: bounds.minY - margin },
    { x: bounds.maxX + margin, y: bounds.maxY + margin },
    { x: bounds.minX - margin, y: bounds.maxY + margin },
  ];
  const value = (point: Readonly<{ x: number; y: number }>): number =>
    plane.c + plane.ax * point.x + plane.ay * point.y - heightMm;
  const kept: { x: number; y: number }[] = [];
  box.forEach((current, index) => {
    const next = box[(index + 1) % box.length] ?? current;
    const a = value(current);
    const b = value(next);
    if (a <= 0) kept.push({ x: current.x, y: current.y });
    if ((a < 0 && b > 0) || (a > 0 && b < 0)) {
      const t = a / (a - b);
      kept.push({ x: current.x + (next.x - current.x) * t, y: current.y + (next.y - current.y) * t });
    }
  });
  return kept;
};

/**
 * The ceiling of a room outline at `ceilingMm`, kept under the roof's underside: flat outside the roof, on the
 * underside where it is lower than the ceiling, flat where it is higher. Without a roof: one flat patch.
 */
export const ceilingUnderRoof = (
  outline: Region,
  ceilingMm: number,
  limit: RoofLimit | null,
): readonly CeilingPatch[] => {
  if (outline.polygons.length === 0) return [];
  if (limit === null) return [{ region: outline, plane: flatAt(ceilingMm) }];
  const patches: CeilingPatch[] = [];
  const outside = differenceRegions(outline, limit.coverage);
  if (outside.polygons.length > 0) patches.push({ region: outside, plane: flatAt(ceilingMm) });
  for (const piece of limit.pieces) {
    const under = intersectRegions(outline, piece.region);
    if (under.polygons.length === 0) continue;
    if (Math.hypot(piece.plane.ax, piece.plane.ay) < levelSlope) {
      patches.push({ region: under, plane: piece.plane.c < ceilingMm ? piece.plane : flatAt(ceilingMm) });
      continue;
    }
    const half = belowHalf(under, piece.plane, ceilingMm);
    const low = half.length < 3 ? { polygons: [] } : intersectRegions(under, regionFromRings([half]));
    const high = low.polygons.length === 0 ? under : differenceRegions(under, low);
    if (low.polygons.length > 0) patches.push({ region: low, plane: piece.plane });
    if (high.polygons.length > 0) patches.push({ region: high, plane: flatAt(ceilingMm) });
  }
  return patches;
};
