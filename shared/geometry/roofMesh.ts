// Roof meshes (Phase 19.1, spec/builder/features/roofs.md#designs): the derived roof surface (roofSurface.ts) built
// into mesh buffers, one per material, in the floor's local frame (plan mm, h above the floor's finished floor).
// Pure and framework-free; never stored.
//
// - Both designs: the authored sheet is the underside (eave height + point heights); the top is `thicknessMm` above it
//   (measured vertically, so the faces of neighbouring pieces meet exactly at every break and fold). Top and
//   underside are each piece's triangles (normals: the piece's plane, up for the top, down for the underside); the
//   edge is one vertical band along the outline, closing the solid. Closed: top, underside and edge in the top,
//   bottom and side materials. Open: the same deck, its edge in the top (covering) material, plus ribs below.
// - Ribs (open design): every piece is a plane with a downhill direction; its ribs run downhill, `ribSpacingMm` apart
//   across the piece (the set centred on the piece), each clipped to the piece; a flat piece's ribs run parallel to
//   its longest boundary edge. Every break line and auto-fold gets a rib along it. A rib is a sheared box hanging
//   `ribHeightMm` below the underside (its sides vertical, its bottom parallel to the plane), `ribWidthMm` wide.
//   Ribs of neighbouring pieces do not line up at the seams (accepted: seen only from below).
// - Physical UVs (mm) for tiles: on a sloped piece u runs level along the slope's contour and v up the slope's
//   surface, so tile rows run along the eaves; a flat piece uses plan x/y. The edge band: u along the outline, v up.
// - Phase 19.3: holes and roof windows (roofOpenings.ts) are cut out of every piece's top and underside along their
//   plan outline (projected vertically onto the faces under them), with a vertical lining band (side material)
//   between underside and top around the cut, and ribs are clipped by them. Step lines get a vertical face between
//   their two sides (above the low side's top: facing the low side; under the raised side: facing the raised side),
//   in the side material or (`stepFace: wall`) the plain wall material. The edge band follows the faces' heights
//   (rim), so a step's raise reaches the outline.
import { DraftSafeWeakMap } from "./draftSafeWeakMap";
import type { RoofValue } from "../domain/schemas/roof";
import type { MeshAccumulator, MeshBuffers, Vec3 } from "./meshData";
import { createMeshAccumulator, pushVertex, toMeshBuffers } from "./meshData";
import type { Region } from "./region";
import { pointInRegion, regionRings } from "./region";
import { roofOpenings, pieceRegion, pieceRegionLeft } from "./roofOpenings";
import { segmentBreaks } from "./roofLimit";
import type { RoofPiece, RoofPlane, RoofSegment3, RoofSurface } from "./roofSurface";
import { planeHeight, roofHeightAt, roofSurface } from "./roofSurface";
import { triangulateRegion } from "./triangulate";
import type { Vec2 } from "./vector";

export type RoofMeshes = Readonly<{
  top: MeshBuffers;
  bottom: MeshBuffers;
  /** The outline's vertical edge band, hole linings and side-material steps (closed: side material; open: top). */
  side: MeshBuffers;
  /** Step faces in the plain wall material (19.3, `stepFace: wall`). */
  stepWall: MeshBuffers;
  /** Open design only (empty for closed). */
  ribs: MeshBuffers;
  /** Number of ribs built. */
  ribCount: number;
}>;

/** Below this plan slope a piece counts as flat (its ribs follow its longest edge). */
const flatSlope = 1e-4;

type Frame = Readonly<{ along: Vec2; up: Vec2; stretch: number }>;

/** A piece's texture frame: level contour direction, up-slope plan direction, and the slope's surface stretch. */
const frameOf = (plane: RoofPlane): Frame => {
  const slope = Math.hypot(plane.ax, plane.ay);
  if (slope < flatSlope) return { along: { x: 1, y: 0 }, up: { x: 0, y: 1 }, stretch: 1 };
  const up = { x: plane.ax / slope, y: plane.ay / slope };
  return { along: { x: up.y, y: -up.x }, up, stretch: Math.sqrt(1 + slope * slope) };
};

const uvOf = (frame: Frame, point: Vec2): Vec2 => ({
  x: point.x * frame.along.x + point.y * frame.along.y,
  y: (point.x * frame.up.x + point.y * frame.up.y) * frame.stretch,
});

const planeNormal = (plane: RoofPlane): Vec3 => {
  const length = Math.hypot(plane.ax, plane.ay, 1);
  return { x: -plane.ax / length, y: -plane.ay / length, h: 1 / length };
};

const negate = (v: Vec3): Vec3 => ({ x: -v.x, y: -v.y, h: -v.h });

const pushTriangle = (
  mesh: MeshAccumulator,
  corners: readonly Vec3[],
  normal: Vec3,
  uvs: readonly Vec2[],
): void => {
  const indices = corners.map((corner, index) =>
    pushVertex(mesh, corner, normal, uvs[index] ?? { x: 0, y: 0 }),
  );
  mesh.indices.push(...indices);
};

/** A planar quad a, b, c, d (counterclockwise seen from its normal's side). */
const pushQuad = (
  mesh: MeshAccumulator,
  corners: readonly [Vec3, Vec3, Vec3, Vec3],
  normal: Vec3,
  uvs: readonly [Vec2, Vec2, Vec2, Vec2],
): void => {
  const base = corners.map((corner, index) => pushVertex(mesh, corner, normal, uvs[index] ?? { x: 0, y: 0 }));
  const [a = 0, b = 0, c = 0, d = 0] = base;
  mesh.indices.push(a, b, c, a, c, d);
};

const lifted = (point: Vec3, by: number): Vec3 => ({ x: point.x, y: point.y, h: point.h + by });

const sub2 = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });

/** The parameter interval(s) of the line origin + t·direction inside a CCW triangle, or null. */
const lineInTriangle = (
  origin: Vec2,
  direction: Vec2,
  triangle: readonly [Vec2, Vec2, Vec2],
): readonly [number, number] | null => {
  let low = Number.NEGATIVE_INFINITY;
  let high = Number.POSITIVE_INFINITY;
  for (let index = 0; index < 3; index += 1) {
    const a = triangle[index];
    const b = triangle[(index + 1) % 3];
    if (a === undefined || b === undefined) return null;
    // Inside: left of a→b, cross(b − a, p − a) ≥ 0.
    const edge = sub2(b, a);
    const value = edge.x * (origin.y - a.y) - edge.y * (origin.x - a.x);
    const rate = edge.x * direction.y - edge.y * direction.x;
    if (Math.abs(rate) < 1e-12) {
      if (value < 0) return null;
      continue;
    }
    const t = -value / rate;
    if (rate > 0) low = Math.max(low, t);
    else high = Math.min(high, t);
  }
  return low < high ? [low, high] : null;
};

/** Intervals of a line inside a piece (the union over its triangles), merged. */
const lineInPiece = (origin: Vec2, direction: Vec2, piece: RoofPiece): (readonly [number, number])[] => {
  const intervals = piece.triangles
    .map((triangle) => lineInTriangle(origin, direction, triangle))
    .filter((interval) => interval !== null)
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [from, to] of intervals) {
    const last = merged[merged.length - 1];
    if (last !== undefined && from <= last[1] + 1e-6) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
};

/** The longest boundary edge of a piece (edges used by one triangle only), as a unit plan direction. */
const longestEdgeDirection = (piece: RoofPiece): Vec2 => {
  const key = (p: Vec2): string => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
  const count = new Map<string, number>();
  const edges: (readonly [Vec2, Vec2])[] = [];
  for (const triangle of piece.triangles)
    for (let index = 0; index < 3; index += 1) {
      const a = triangle[index];
      const b = triangle[(index + 1) % 3];
      if (a === undefined || b === undefined) continue;
      const k = [key(a), key(b)].sort().join("|");
      count.set(k, (count.get(k) ?? 0) + 1);
      edges.push([a, b]);
    }
  let best: Vec2 = { x: 1, y: 0 };
  let bestLength = -1;
  for (const [a, b] of edges) {
    const k = [key(a), key(b)].sort().join("|");
    if (count.get(k) !== 1) continue;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length > bestLength + 1e-6) {
      bestLength = length;
      best = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    }
  }
  return best;
};

/**
 * A rib: a sheared box under the plan segment from → to, its top on the heights `topAt` gives (the underside),
 * `depth` deep and `width` wide, sides vertical.
 */
const pushRib = (
  mesh: MeshAccumulator,
  from: Vec2,
  to: Vec2,
  topAt: (point: Vec2) => number,
  width: number,
  depth: number,
): boolean => {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length < 1) return false;
  const d = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
  const side = { x: -d.y * (width / 2), y: d.x * (width / 2) };
  const corner = (base: Vec2, sign: number, down: boolean): Vec3 => {
    const p = { x: base.x + side.x * sign, y: base.y + side.y * sign };
    return { x: p.x, y: p.y, h: topAt(p) - (down ? depth : 0) };
  };
  // Corners: L/R = left (+side) / right (−side); 0 at `from`, 1 at `to`; t top, b bottom.
  const l0t = corner(from, 1, false);
  const r0t = corner(from, -1, false);
  const l1t = corner(to, 1, false);
  const r1t = corner(to, -1, false);
  const l0b = corner(from, 1, true);
  const r0b = corner(from, -1, true);
  const l1b = corner(to, 1, true);
  const r1b = corner(to, -1, true);
  const leftNormal: Vec3 = { x: -d.y, y: d.x, h: 0 };
  const rightNormal: Vec3 = { x: d.y, y: -d.x, h: 0 };
  const startNormal: Vec3 = { x: -d.x, y: -d.y, h: 0 };
  const endNormal: Vec3 = { x: d.x, y: d.y, h: 0 };
  // Bottom: parallel to the top, facing down.
  const ux = l1b.x - r0b.x;
  const uy = l1b.y - r0b.y;
  const uh = l1b.h - r0b.h;
  const vx = r1b.x - l0b.x;
  const vy = r1b.y - l0b.y;
  const vh = r1b.h - l0b.h;
  let bottom: Vec3 = { x: uy * vh - uh * vy, y: uh * vx - ux * vh, h: ux * vy - uy * vx };
  const bottomLength = Math.hypot(bottom.x, bottom.y, bottom.h) || 1;
  bottom = { x: bottom.x / bottomLength, y: bottom.y / bottomLength, h: bottom.h / bottomLength };
  if (bottom.h > 0) bottom = negate(bottom);
  const along = (p: Vec3): number => (p.x - from.x) * d.x + (p.y - from.y) * d.y;
  // Each quad counterclockwise seen from outside (from its normal's side).
  pushQuad(mesh, [l0t, l1t, l1b, l0b], leftNormal, [
    { x: along(l0t), y: l0t.h },
    { x: along(l1t), y: l1t.h },
    { x: along(l1b), y: l1b.h },
    { x: along(l0b), y: l0b.h },
  ]);
  pushQuad(mesh, [r0b, r1b, r1t, r0t], rightNormal, [
    { x: along(r0b), y: r0b.h },
    { x: along(r1b), y: r1b.h },
    { x: along(r1t), y: r1t.h },
    { x: along(r0t), y: r0t.h },
  ]);
  pushQuad(mesh, [l0b, r0b, r0t, l0t], startNormal, [
    { x: 0, y: l0b.h },
    { x: width, y: r0b.h },
    { x: width, y: r0t.h },
    { x: 0, y: l0t.h },
  ]);
  pushQuad(mesh, [r1b, l1b, l1t, r1t], endNormal, [
    { x: 0, y: r1b.h },
    { x: width, y: l1b.h },
    { x: width, y: l1t.h },
    { x: 0, y: r1t.h },
  ]);
  pushQuad(mesh, [r0b, l0b, l1b, r1b], bottom, [
    { x: 0, y: 0 },
    { x: 0, y: width },
    { x: length, y: width },
    { x: length, y: 0 },
  ]);
  return true;
};

export type RibOptions = Readonly<{ heightMm: number; widthMm: number; spacingMm: number }>;

/** Rib plan segments of one piece: downhill (or along its longest edge when flat) at the spacing, clipped. */
export const pieceRibSegments = (piece: RoofPiece, options: RibOptions): (readonly [Vec2, Vec2])[] => {
  const slope = Math.hypot(piece.plane.ax, piece.plane.ay);
  const direction =
    slope < flatSlope
      ? longestEdgeDirection(piece)
      : { x: -piece.plane.ax / slope, y: -piece.plane.ay / slope };
  const across = { x: -direction.y, y: direction.x };
  const offsets = piece.triangles.flat().map((p) => p.x * across.x + p.y * across.y);
  const min = Math.min(...offsets);
  const max = Math.max(...offsets);
  const span = max - min;
  const spacing = Math.max(options.spacingMm, options.widthMm);
  if (span < options.widthMm) return [];
  const count = Math.floor((span - options.widthMm) / spacing) + 1;
  const first = min + (span - (count - 1) * spacing) / 2;
  const segments: (readonly [Vec2, Vec2])[] = [];
  for (let k = 0; k < count; k += 1) {
    const offset = first + k * spacing;
    const origin = { x: across.x * offset, y: across.y * offset };
    for (const [from, to] of lineInPiece(origin, direction, piece)) {
      if (to - from < options.widthMm) continue;
      segments.push([
        { x: origin.x + direction.x * from, y: origin.y + direction.y * from },
        { x: origin.x + direction.x * to, y: origin.y + direction.y * to },
      ]);
    }
  }
  return segments;
};

const segmentHeight =
  (segment: RoofSegment3, base: number) =>
  (point: Vec2): number => {
    const dx = segment.b.x - segment.a.x;
    const dy = segment.b.y - segment.a.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : ((point.x - segment.a.x) * dx + (point.y - segment.a.y) * dy) / lengthSq;
    return base + segment.a.h + (segment.b.h - segment.a.h) * t;
  };

/** The roof's meshes in the floor frame (h above the finished floor). */
/** Plan edges of regions' rings. */
const ringEdges = (regions: readonly Region[]): (readonly [Vec2, Vec2])[] =>
  regions.flatMap((region) =>
    regionRings(region).flatMap((ring) =>
      ring.flatMap((a, index): (readonly [Vec2, Vec2])[] => {
        const b = ring[(index + 1) % ring.length];
        return b === undefined ? [] : [[a, b] as const];
      }),
    ),
  );

/** The stretches of segment from→to outside `cut` (plan), as parameter pairs. */
const outsideCut = (
  from: Vec2,
  to: Vec2,
  cut: Region,
  edges: readonly (readonly [Vec2, Vec2])[],
): [number, number][] => {
  if (cut.polygons.length === 0) return [[0, 1]];
  const breaks = segmentBreaks(from, to, edges);
  const kept: [number, number][] = [];
  for (let index = 0; index + 1 < breaks.length; index += 1) {
    const t0 = breaks[index] ?? 0;
    const t1 = breaks[index + 1] ?? 1;
    if (t1 - t0 < 1e-9) continue;
    const middle = {
      x: from.x + (to.x - from.x) * ((t0 + t1) / 2),
      y: from.y + (to.y - from.y) * ((t0 + t1) / 2),
    };
    if (pointInRegion(middle, cut)) continue;
    const last = kept[kept.length - 1];
    if (last !== undefined && Math.abs(last[1] - t0) < 1e-9) last[1] = t1;
    else kept.push([t0, t1]);
  }
  return kept;
};

const along = (from: Vec2, to: Vec2, t: number): Vec2 => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
});

/** The roof's meshes in the floor frame (h above the finished floor). */
export const buildRoofMeshes = (
  roof: Pick<
    RoofValue,
    | "points"
    | "outline"
    | "lines"
    | "design"
    | "eaveHeightMm"
    | "thicknessMm"
    | "ribHeightMm"
    | "ribWidthMm"
    | "ribSpacingMm"
  > &
    Partial<Pick<RoofValue, "holes" | "windows">>,
  surface: RoofSurface = roofSurface(roof),
  cut: Region = { polygons: [] },
): RoofMeshes => {
  const base = roof.eaveHeightMm;
  const thickness = Math.max(1, roof.thicknessMm);
  const top = createMeshAccumulator();
  const bottom = createMeshAccumulator();
  const side = createMeshAccumulator();
  const stepWall = createMeshAccumulator();
  const ribs = createMeshAccumulator();
  const cutting = cut.polygons.length > 0;
  for (const piece of surface.pieces) {
    const frame = frameOf(piece.plane);
    const up = planeNormal(piece.plane);
    const down = negate(up);
    // With holes (19.3) the piece's region less the cut is triangulated again; otherwise its own triangles.
    const triangles: readonly (readonly Vec3[])[] = cutting
      ? (() => {
          const left = pieceRegionLeft(piece, cut);
          const { vertices, indices } = triangulateRegion(left);
          const lifted3 = vertices.map((point) => ({ ...point, h: planeHeight(piece.plane, point) }));
          const list: (readonly Vec3[])[] = [];
          for (let at = 0; at + 2 < indices.length; at += 3) {
            const a = lifted3[indices[at] ?? 0];
            const b = lifted3[indices[at + 1] ?? 0];
            const c = lifted3[indices[at + 2] ?? 0];
            if (a !== undefined && b !== undefined && c !== undefined) list.push([a, b, c]);
          }
          return list;
        })()
      : piece.triangles;
    for (const triangle of triangles) {
      const under = triangle.map((point) => lifted(point, base));
      const over = under.map((point) => lifted(point, thickness));
      const uvs = triangle.map((point) => uvOf(frame, point));
      pushTriangle(top, over, up, uvs);
      pushTriangle(bottom, [...under].reverse(), down, [...uvs].reverse());
    }
  }
  // The edge band along the outline (CCW ring: outward is the right of each edge), at the faces' heights.
  let run = 0;
  for (const { a, b } of surface.rim) {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) continue;
    const normal: Vec3 = { x: (b.y - a.y) / length, y: -(b.x - a.x) / length, h: 0 };
    const a0 = lifted(a, base);
    const b0 = lifted(b, base);
    const a1 = lifted(a0, thickness);
    const b1 = lifted(b0, thickness);
    pushQuad(side, [a0, b0, b1, a1], normal, [
      { x: run, y: a0.h },
      { x: run + length, y: b0.h },
      { x: run + length, y: b1.h },
      { x: run, y: a1.h },
    ]);
    run += length;
  }
  // Hole linings (19.3): around every cut ring, a vertical band facing into the hole (the cut lies left of each
  // ring edge), split where it crosses from one piece to the next.
  if (cutting) {
    const pieceEdges = ringEdges(surface.pieces.map(pieceRegion));
    for (const ring of regionRings(cut))
      ring.forEach((a, index) => {
        const b = ring[(index + 1) % ring.length];
        if (b === undefined) return;
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        if (length < 0.5) return;
        const inward: Vec3 = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length, h: 0 };
        const breaks = segmentBreaks(a, b, pieceEdges);
        for (let k = 0; k + 1 < breaks.length; k += 1) {
          const t0 = breaks[k] ?? 0;
          const t1 = breaks[k + 1] ?? 1;
          if (t1 - t0 < 1e-9) continue;
          const middle = along(a, b, (t0 + t1) / 2);
          // The roof is on the right of the edge: probe just outside the cut.
          const probe = { x: middle.x - inward.x * 0.5, y: middle.y - inward.y * 0.5 };
          const piece = surface.pieces.find((candidate) => pointInRegion(probe, pieceRegion(candidate)));
          if (piece === undefined) continue;
          const p0 = along(a, b, t0);
          const p1 = along(a, b, t1);
          const h0 = base + planeHeight(piece.plane, p0);
          const h1 = base + planeHeight(piece.plane, p1);
          // Seen from inside the hole (normal `inward`), b → a runs counterclockwise.
          pushQuad(
            side,
            [
              { ...p1, h: h1 },
              { ...p0, h: h0 },
              { ...p0, h: h0 + thickness },
              { ...p1, h: h1 + thickness },
            ],
            inward,
            [
              { x: t1 * length, y: h1 },
              { x: t0 * length, y: h0 },
              { x: t0 * length, y: h0 + thickness },
              { x: t1 * length, y: h1 + thickness },
            ],
          );
        }
      });
  }
  // Step faces (19.3).
  for (const step of surface.steps) {
    const { low, high } = step;
    const length = Math.hypot(high.b.x - high.a.x, high.b.y - high.a.y);
    if (length === 0) continue;
    const mesh = step.face === "wall" ? stepWall : side;
    // The raised side is left of high.a → high.b; the low side is on its right.
    const toLow: Vec3 = { x: (high.b.y - high.a.y) / length, y: -(high.b.x - high.a.x) / length, h: 0 };
    const toHigh = negate(toLow);
    const lowTopA = base + low.a.h + thickness;
    const lowTopB = base + low.b.h + thickness;
    const highTopA = base + high.a.h + thickness;
    const highTopB = base + high.b.h + thickness;
    if (highTopA - lowTopA > 0.5 || highTopB - lowTopB > 0.5)
      pushQuad(
        mesh,
        [
          { x: high.a.x, y: high.a.y, h: lowTopA },
          { x: high.b.x, y: high.b.y, h: lowTopB },
          { x: high.b.x, y: high.b.y, h: highTopB },
          { x: high.a.x, y: high.a.y, h: highTopA },
        ],
        toLow,
        [
          { x: 0, y: lowTopA },
          { x: length, y: lowTopB },
          { x: length, y: highTopB },
          { x: 0, y: highTopA },
        ],
      );
    const lowA = base + low.a.h;
    const lowB = base + low.b.h;
    const highA = base + high.a.h;
    const highB = base + high.b.h;
    if (highA - lowA > 0.5 || highB - lowB > 0.5)
      pushQuad(
        mesh,
        [
          { x: high.b.x, y: high.b.y, h: lowB },
          { x: high.a.x, y: high.a.y, h: lowA },
          { x: high.a.x, y: high.a.y, h: highA },
          { x: high.b.x, y: high.b.y, h: highB },
        ],
        toHigh,
        [
          { x: length, y: lowB },
          { x: 0, y: lowA },
          { x: 0, y: highA },
          { x: length, y: highB },
        ],
      );
  }
  let ribCount = 0;
  if (roof.design === "open") {
    const options = { heightMm: roof.ribHeightMm, widthMm: roof.ribWidthMm, spacingMm: roof.ribSpacingMm };
    const cutEdges = ringEdges([cut]);
    const clipped = (from: Vec2, to: Vec2): (readonly [Vec2, Vec2])[] =>
      outsideCut(from, to, cut, cutEdges).map(
        ([t0, t1]) => [along(from, to, t0), along(from, to, t1)] as const,
      );
    for (const piece of surface.pieces) {
      const topAt = (point: Vec2): number => base + planeHeight(piece.plane, point);
      for (const [from, to] of pieceRibSegments(piece, options))
        for (const [a, b] of clipped(from, to))
          if (pushRib(ribs, a, b, topAt, options.widthMm, options.heightMm)) ribCount += 1;
    }
    // A rib along a break or fold line (19.5: no gaps under valley ribs) has its sides' tops on the underside of
    // the face each side lies under, so it closes against both slopes (a valley's faces rise away from the line, a
    // ridge's fall); where no face is under a corner it keeps the line's height. Step lines keep the line's height
    // (their raised side is a vertical face).
    const onUnderside =
      (segment: RoofSegment3) =>
      (point: Vec2): number => {
        const height = roofHeightAt(surface, point);
        return height === null ? segmentHeight(segment, base)(point) : base + height;
      };
    for (const segment of [...surface.breaks, ...surface.folds])
      for (const [a, b] of clipped(segment.a, segment.b))
        if (pushRib(ribs, a, b, onUnderside(segment), options.widthMm, options.heightMm)) ribCount += 1;
    for (const segment of surface.steps.map((step) => step.low))
      for (const [a, b] of clipped(segment.a, segment.b))
        if (pushRib(ribs, a, b, segmentHeight(segment, base), options.widthMm, options.heightMm))
          ribCount += 1;
  }
  return {
    top: toMeshBuffers(top),
    bottom: toMeshBuffers(bottom),
    side: toMeshBuffers(side),
    stepWall: toMeshBuffers(stepWall),
    ribs: toMeshBuffers(ribs),
    ribCount,
  };
};

const meshCache = new DraftSafeWeakMap<object, RoofMeshes>();

/** buildRoofMeshes memoized by the roof value. */
export const roofMeshes = (roof: RoofValue): RoofMeshes => {
  const cached = meshCache.get(roof);
  if (cached !== undefined) return cached;
  const surface = roofSurface(roof);
  const meshes = buildRoofMeshes(roof, surface, roofOpenings(roof, surface).cut);
  meshCache.set(roof, meshes);
  return meshes;
};
