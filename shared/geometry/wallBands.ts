// RealWall bands for one area in the area frame (D04): span ∩ boundary intervals of the source edge,
// thickness placed by alignment, and miter joins where wall pieces meet at a boundary corner (straight or
// arc: faces are lines or circles, Phase 4.1). Walls on a
// circle's arc (D20) follow the arc: arc length from the circle's local 0°, bands as annular sectors split
// into pieces of at most a quarter turn, sampled at the circle's facet angles.
import type { ShapeValue } from "@shared/domain/schemas/shapes";
import { resolveSpan } from "@shared/domain/house/wallSpan";
import type { WallAlignment, WallValue } from "@shared/domain/schemas/wall";
import type { FloorShapeUnion } from "./floorShapeUnion";
import type { Interval } from "./interval";
import { intersectIntervalWith } from "./interval";
import type { Ring } from "./region";
import { circleArcEdgeKey, circleSegmentCount, sourceEdgeId } from "./shapeOutline";
import {
  arcJoinToleranceMm,
  joinToleranceMm,
  minPieceLengthMm,
  miterLimitFactor,
  parallelSineTolerance,
} from "./tolerances";
import type { Vec2 } from "./vector";
import {
  addVec,
  crossVec,
  distance,
  dotVec,
  intersectLines,
  normalizeVec,
  rightNormal,
  scaleVec,
  subVec,
} from "./vector";

export type WallSide = "interior" | "exterior";

/** Which face of a band: the room-facing side, the outward side, or an end (cap material). */
export type BandFaceSide = WallSide | "end";

export type WallFaceRef = Readonly<{
  wallId: string;
  areaId: string;
  side: BandFaceSide;
  /** A face of a box or niche on this wall side (Phase 5.0): drawn with the relief's material, picks it. */
  reliefId?: string;
}>;

/** A vertical band face as a plan segment; walking start → end, the band is on the left (outward normal to the right). */
export type BandFace = Readonly<{ start: Vec2; end: Vec2; ref: WallFaceRef }>;

export type WallBandPiece = Readonly<{
  /** Extent along the source edge, mm from its start vertex. */
  fromMm: number;
  toMm: number;
  /** Band footprint, CCW. */
  ring: Ring;
  faces: readonly BandFace[];
}>;

/** A wall's source-edge line: direction in CCW boundary order and the outward (right-hand) normal. */
export type WallEdgeFrame = Readonly<{
  start: Vec2;
  end: Vec2;
  direction: Vec2;
  outwardNormal: Vec2;
  lengthMm: number;
}>;

/** A circle in some frame: positions along it are arc length (mm) counterclockwise from `zeroAngleRad`. */
export type ArcFrame = Readonly<{ centerMm: Vec2; radiusMm: number; zeroAngleRad: number }>;

export type RealWall = Readonly<{
  wallId: string;
  areaId: string;
  heightMm: number;
  thicknessMm: number;
  alignment: WallAlignment;
  /** Offsets of the interior and exterior faces from the contour along the outward normal. */
  interiorOffsetMm: number;
  exteriorOffsetMm: number;
  edge: WallEdgeFrame;
  /** The authored span, clamped to the edge. */
  spanMm: Interval;
  /** Arc walls (D20): the circle the span is measured on; `edge` is then the chord of the span. */
  arc: ArcFrame | null;
  /** Effective pieces: span ∩ the edge's boundary intervals. */
  pieces: readonly WallBandPiece[];
}>;

export type OrphanReason =
  "shapeMissing" | "shapeInvalid" | "edgeMissing" | "curvedEdge" | "spanOutsideEdge" | "notOnBoundary";

export type OrphanWall = Readonly<{ wallId: string; areaId: string; reason: OrphanReason }>;

export type AreaWalls = Readonly<{ realWalls: readonly RealWall[]; orphans: readonly OrphanWall[] }>;

/** Face offsets along the outward normal for an alignment: outside [0, t], inside [−t, 0], center [−t/2, t/2]. */
export const bandOffsets = (
  alignment: WallAlignment,
  thicknessMm: number,
): { interiorOffsetMm: number; exteriorOffsetMm: number } => {
  switch (alignment) {
    case "outside":
      return { interiorOffsetMm: 0, exteriorOffsetMm: thicknessMm };
    case "inside":
      return { interiorOffsetMm: -thicknessMm, exteriorOffsetMm: 0 };
    case "center":
      return { interiorOffsetMm: -thicknessMm / 2, exteriorOffsetMm: thicknessMm / 2 };
  }
};

type Cap = { interior: Vec2; exterior: Vec2 };

/** A band face's curve in plan: a straight line, or a circle for walls on an arc. */
type FaceCurve =
  | Readonly<{ kind: "line"; point: Vec2; direction: Vec2 }>
  | Readonly<{ kind: "circle"; center: Vec2; radius: number }>;

/** What a corner join needs from a piece, straight or curved: its ends, directions there, and face curves. */
type Joinable = {
  readonly thicknessMm: number;
  /** Arc pieces join within the looser arc tolerance. */
  readonly curved: boolean;
  readonly startPoint: Vec2;
  readonly endPoint: Vec2;
  /** Boundary direction (CCW order) at the start and end. */
  readonly startTangent: Vec2;
  readonly endTangent: Vec2;
  readonly interiorFace: FaceCurve;
  readonly exteriorFace: FaceCurve;
  startCap: Cap | null;
  endCap: Cap | null;
};

type DraftPiece = Joinable & {
  readonly wall: WallValue;
  readonly frame: WallEdgeFrame;
  readonly interiorOffsetMm: number;
  readonly exteriorOffsetMm: number;
  readonly fromMm: number;
  readonly toMm: number;
};

/** One boundary interval of an arc wall; split into quarter-turn band pieces after joining. */
type ArcDraft = Joinable & {
  readonly arc: ArcFrame;
  readonly interiorOffsetMm: number;
  readonly exteriorOffsetMm: number;
  readonly interval: Interval;
};

const nearestTo = (candidates: readonly Vec2[], reference: Vec2): Vec2 | null =>
  [...candidates].sort((a, b) => distance(a, reference) - distance(b, reference))[0] ?? null;

/** Intersections of a line (unit direction) with a circle. */
const lineCircle = (point: Vec2, direction: Vec2, center: Vec2, radius: number): Vec2[] => {
  const f = subVec(point, center);
  const b = dotVec(f, direction);
  const discriminant = b * b - (dotVec(f, f) - radius * radius);
  if (discriminant < 0) return [];
  const root = Math.sqrt(discriminant);
  return [-b - root, -b + root].map((t) => addVec(point, scaleVec(direction, t)));
};

const circleCircle = (c0: Vec2, r0: number, c1: Vec2, r1: number): Vec2[] => {
  const d = distance(c0, c1);
  if (d < 1e-9 || d > r0 + r1 || d < Math.abs(r0 - r1)) return [];
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r0 * r0 - a * a));
  const axis = scaleVec(subVec(c1, c0), 1 / d);
  const foot = addVec(c0, scaleVec(axis, a));
  const across = { x: -axis.y, y: axis.x };
  return [addVec(foot, scaleVec(across, h)), addVec(foot, scaleVec(across, -h))];
};

/** Where two face curves meet, nearest to the shared boundary corner. */
const intersectFaces = (a: FaceCurve, b: FaceCurve, corner: Vec2): Vec2 | null => {
  if (a.kind === "line" && b.kind === "line")
    return intersectLines(a.point, a.direction, b.point, b.direction, parallelSineTolerance);
  if (a.kind === "line" && b.kind === "circle")
    return nearestTo(lineCircle(a.point, a.direction, b.center, b.radius), corner);
  if (a.kind === "circle" && b.kind === "line")
    return nearestTo(lineCircle(b.point, b.direction, a.center, a.radius), corner);
  if (a.kind === "circle" && b.kind === "circle")
    return nearestTo(circleCircle(a.center, a.radius, b.center, b.radius), corner);
  return null;
};

/**
 * Miter between piece X's end and piece Y's start: the interior faces meet, and the exterior faces meet.
 * Faces are lines or circles, so arc walls join their neighbours like straight corners do.
 */
const miterJoin = (x: Joinable, y: Joinable): Cap | null => {
  const interior = intersectFaces(x.interiorFace, y.interiorFace, x.endPoint);
  const exterior = intersectFaces(x.exteriorFace, y.exteriorFace, x.endPoint);
  if (interior === null || exterior === null) return null;
  const limit = miterLimitFactor * Math.max(x.thicknessMm, y.thicknessMm);
  if (distance(interior, x.endPoint) > limit || distance(exterior, x.endPoint) > limit) return null;
  return { interior, exterior };
};

const turnAngle = (from: Vec2, to: Vec2): number => Math.atan2(crossVec(from, to), dotVec(from, to));

/** Joins each piece end to the following piece start at the same point (the sharpest left turn wins at pinch vertices). */
const joinCorners = (pieces: readonly Joinable[]): void => {
  for (const x of pieces) {
    const candidates = pieces.filter(
      (y) =>
        y !== x &&
        y.startCap === null &&
        distance(x.endPoint, y.startPoint) <= (x.curved || y.curved ? arcJoinToleranceMm : joinToleranceMm) &&
        Math.abs(crossVec(x.endTangent, y.startTangent)) > parallelSineTolerance,
    );
    const next = candidates.sort(
      (a, b) => turnAngle(x.endTangent, b.startTangent) - turnAngle(x.endTangent, a.startTangent),
    )[0];
    if (next === undefined) continue;
    const join = miterJoin(x, next);
    if (join === null) continue;
    x.endCap = join;
    next.startCap = join;
  }
};

const buildPiece = (piece: DraftPiece, areaId: string): WallBandPiece => {
  const along = (point: Vec2, offsetMm: number): Vec2 =>
    addVec(point, scaleVec(piece.frame.outwardNormal, offsetMm));
  const startExterior = piece.startCap?.exterior ?? along(piece.startPoint, piece.exteriorOffsetMm);
  const startInterior = piece.startCap?.interior ?? along(piece.startPoint, piece.interiorOffsetMm);
  const endExterior = piece.endCap?.exterior ?? along(piece.endPoint, piece.exteriorOffsetMm);
  const endInterior = piece.endCap?.interior ?? along(piece.endPoint, piece.interiorOffsetMm);
  const ref = (side: BandFaceSide): WallFaceRef => ({ wallId: piece.wall.id, areaId, side });
  const ring: Ring = [startExterior, endExterior, endInterior, startInterior];
  const faces: BandFace[] = [
    { start: startExterior, end: endExterior, ref: ref("exterior") },
    { start: endExterior, end: endInterior, ref: ref("end") },
    { start: endInterior, end: startInterior, ref: ref("interior") },
    { start: startInterior, end: startExterior, ref: ref("end") },
  ];
  return { fromMm: piece.fromMm, toMm: piece.toMm, ring, faces };
};

/** A point on the wall's source line at a distance along it, with the outward normal there. */
export const wallPointAt = (
  wall: Pick<RealWall, "edge" | "arc">,
  alongMm: number,
): Readonly<{ point: Vec2; normal: Vec2 }> => {
  if (wall.arc === null)
    return {
      point: addVec(wall.edge.start, scaleVec(wall.edge.direction, alongMm)),
      normal: wall.edge.outwardNormal,
    };
  const angle = wall.arc.zeroAngleRad + alongMm / wall.arc.radiusMm;
  const normal = { x: Math.cos(angle), y: Math.sin(angle) };
  return { point: addVec(wall.arc.centerMm, scaleVec(normal, wall.arc.radiusMm)), normal };
};

/** Position (mm along the source line) of the point nearest to `point`; arcs wrap within [0, length). */
export const wallAlongOf = (wall: Pick<RealWall, "edge" | "arc">, point: Vec2): number => {
  if (wall.arc === null) return dotVec(subVec(point, wall.edge.start), wall.edge.direction);
  const angle =
    Math.atan2(point.y - wall.arc.centerMm.y, point.x - wall.arc.centerMm.x) - wall.arc.zeroAngleRad;
  const turn = 2 * Math.PI;
  return (((angle % turn) + turn) % turn) * wall.arc.radiusMm;
};

const maxArcPieceRad = Math.PI / 2;

/** Unused straight frame for evaluating arc positions before the chord frame exists. */
const chordStub: WallEdgeFrame = {
  start: { x: 0, y: 0 },
  end: { x: 1, y: 0 },
  direction: { x: 1, y: 0 },
  outwardNormal: { x: 0, y: -1 },
  lengthMm: 1,
};

/** Boundary direction (CCW) on an arc at a local angle. */
const arcTangent = (arc: ArcFrame, angle: number): Vec2 => ({
  x: -Math.sin(arc.zeroAngleRad + angle),
  y: Math.cos(arc.zeroAngleRad + angle),
});

/** The local angle of a point on the circle, unwrapped next to `near`. */
const localAngleNear = (arc: ArcFrame, point: Vec2, near: number): number => {
  const angle = Math.atan2(point.y - arc.centerMm.y, point.x - arc.centerMm.x) - arc.zeroAngleRad;
  const turn = 2 * Math.PI;
  return near + ((((angle - near + Math.PI) % turn) + turn) % turn) - Math.PI;
};

/**
 * Annular-sector band pieces for one joined arc interval (area frame). Pieces are at most a quarter turn;
 * the first piece's start and the last piece's end follow the corner joins (each face starts or stops
 * where it meets the neighbour's face), other ends are radial.
 */
const arcBandPieces = (draft: ArcDraft, wallId: string, areaId: string): WallBandPiece[] => {
  const { arc, interval } = draft;
  const r = arc.radiusMm;
  const facet = (2 * Math.PI) / circleSegmentCount(r);
  const pieces: WallBandPiece[] = [];
  const total = (interval.toMm - interval.fromMm) / r;
  const count = Math.max(1, Math.ceil(total / maxArcPieceRad - 1e-9));
  // Facet samples closer than a sliver to either end would leave near-duplicate vertices.
  const skip = minPieceLengthMm / r;
  const faceAngles = (from: number, to: number): number[] => {
    const angles = [from];
    for (let step = Math.floor(from / facet) + 1; step * facet < to - skip; step += 1)
      if (step * facet > from + skip) angles.push(step * facet);
    angles.push(to);
    return angles;
  };
  /**
   * A face on this piece: its angular range and exact end points. At a joined wall end the face starts or
   * stops at the cap point (reused exactly so the neighbour's cap matches); other ends are radial.
   */
  const faceOf = (a0: number, a1: number, k: number, side: keyof Cap, offsetMm: number): Vec2[] => {
    const at = (angle: number): Vec2 => ({
      x: arc.centerMm.x + Math.cos(arc.zeroAngleRad + angle) * (r + offsetMm),
      y: arc.centerMm.y + Math.sin(arc.zeroAngleRad + angle) * (r + offsetMm),
    });
    const startCap = k === 0 ? draft.startCap : null;
    const endCap = k === count - 1 ? draft.endCap : null;
    const from = startCap === null ? a0 : localAngleNear(arc, startCap[side], a0);
    const to = endCap === null ? a1 : localAngleNear(arc, endCap[side], a1);
    if (to - from <= 1e-6) return faceAngles(a0, a1).map(at);
    const points = faceAngles(from, to).map(at);
    if (startCap !== null) points[0] = startCap[side];
    if (endCap !== null) points[points.length - 1] = endCap[side];
    return points;
  };
  for (let k = 0; k < count; k += 1) {
    const a0 = interval.fromMm / r + (total * k) / count;
    const a1 = interval.fromMm / r + (total * (k + 1)) / count;
    const exterior = faceOf(a0, a1, k, "exterior", draft.exteriorOffsetMm);
    const interior = faceOf(a0, a1, k, "interior", draft.interiorOffsetMm).reverse();
    const ref = (side: BandFaceSide): WallFaceRef => ({ wallId, areaId, side });
    const faces: BandFace[] = [];
    exterior.forEach((point, i) => {
      const next = exterior[i + 1];
      if (next !== undefined) faces.push({ start: point, end: next, ref: ref("exterior") });
    });
    const lastExterior = exterior[exterior.length - 1];
    const firstInterior = interior[0];
    if (lastExterior !== undefined && firstInterior !== undefined)
      faces.push({ start: lastExterior, end: firstInterior, ref: ref("end") });
    interior.forEach((point, i) => {
      const next = interior[i + 1];
      if (next !== undefined) faces.push({ start: point, end: next, ref: ref("interior") });
    });
    const lastInterior = interior[interior.length - 1];
    const firstExterior = exterior[0];
    if (lastInterior !== undefined && firstExterior !== undefined)
      faces.push({ start: lastInterior, end: firstExterior, ref: ref("end") });
    pieces.push({ fromMm: a0 * r, toMm: a1 * r, ring: [...exterior, ...interior], faces });
  }
  return pieces;
};

export const computeAreaWalls = (
  areaId: string,
  shapes: readonly ShapeValue[],
  union: FloorShapeUnion,
  walls: readonly WallValue[],
): AreaWalls => {
  const orphans: OrphanWall[] = [];
  const drafts: DraftPiece[] = [];
  const arcEntries: { wall: Omit<RealWall, "pieces">; drafts: ArcDraft[] }[] = [];
  const resolved: {
    wall: WallValue;
    frame: WallEdgeFrame;
    spanMm: Interval;
    interiorOffsetMm: number;
    exteriorOffsetMm: number;
  }[] = [];
  const validShapeIds = new Set(union.outlines.map((outline) => outline.shapeId));
  for (const wall of walls) {
    const orphan = (reason: OrphanReason): void => {
      orphans.push({ wallId: wall.id, areaId, reason });
    };
    if (!shapes.some((shape) => shape.id === wall.sourceEdge.shapeId)) {
      orphan("shapeMissing");
      continue;
    }
    if (!validShapeIds.has(wall.sourceEdge.shapeId)) {
      orphan("shapeInvalid");
      continue;
    }
    if (wall.sourceEdge.edge === circleArcEdgeKey) {
      const arcBoundary = union.arcs.get(wall.sourceEdge.shapeId);
      if (arcBoundary === undefined) {
        orphan("edgeMissing");
        continue;
      }
      const arcPositions = resolveSpan(wall.spanMm, arcBoundary.lengthMm);
      const arcSpan: Interval = {
        fromMm: Math.max(0, arcPositions.start),
        toMm: Math.min(arcBoundary.lengthMm, arcPositions.end),
      };
      if (arcSpan.toMm - arcSpan.fromMm < minPieceLengthMm) {
        orphan("spanOutsideEdge");
        continue;
      }
      const arcPieces = intersectIntervalWith(arcSpan, arcBoundary.intervals, minPieceLengthMm);
      if (arcPieces.length === 0) {
        orphan("notOnBoundary");
        continue;
      }
      const arc: ArcFrame = {
        centerMm: arcBoundary.centerMm,
        radiusMm: arcBoundary.radiusMm,
        zeroAngleRad: 0,
      };
      const arcOffsets = bandOffsets(wall.alignment, wall.thicknessMm);
      const startPoint = wallPointAt({ edge: chordStub, arc }, arcSpan.fromMm);
      const endPoint = wallPointAt({ edge: chordStub, arc }, arcSpan.toMm);
      const chord = subVec(endPoint.point, startPoint.point);
      const chordDirection =
        Math.hypot(chord.x, chord.y) < minPieceLengthMm
          ? { x: -startPoint.normal.y, y: startPoint.normal.x }
          : normalizeVec(chord);
      const arcDrafts = arcPieces.map((piece): ArcDraft => {
        const from = piece.fromMm / arc.radiusMm;
        const to = piece.toMm / arc.radiusMm;
        return {
          arc,
          ...arcOffsets,
          interval: piece,
          thicknessMm: wall.thicknessMm,
          curved: true,
          startPoint: wallPointAt({ edge: chordStub, arc }, piece.fromMm).point,
          endPoint: wallPointAt({ edge: chordStub, arc }, piece.toMm).point,
          startTangent: arcTangent(arc, from),
          endTangent: arcTangent(arc, to),
          interiorFace: {
            kind: "circle",
            center: arc.centerMm,
            radius: arc.radiusMm + arcOffsets.interiorOffsetMm,
          },
          exteriorFace: {
            kind: "circle",
            center: arc.centerMm,
            radius: arc.radiusMm + arcOffsets.exteriorOffsetMm,
          },
          startCap: null,
          endCap: null,
        };
      });
      arcEntries.push({
        drafts: arcDrafts,
        wall: {
          wallId: wall.id,
          areaId,
          heightMm: wall.heightMm,
          thicknessMm: wall.thicknessMm,
          alignment: wall.alignment,
          ...arcOffsets,
          edge: {
            start: startPoint.point,
            end: endPoint.point,
            direction: chordDirection,
            outwardNormal: rightNormal(chordDirection),
            lengthMm: arcBoundary.lengthMm,
          },
          spanMm: arcSpan,
          arc,
        },
      });
      continue;
    }
    const edge = union.edges.get(sourceEdgeId(wall.sourceEdge.shapeId, wall.sourceEdge.edge));
    if (edge === undefined) {
      orphan("edgeMissing");
      continue;
    }
    if (!edge.wallable) {
      orphan("curvedEdge");
      continue;
    }
    // Span ends are attached to the edge's corners (D04, Phase 3): resolve them on the current edge length.
    const positions = resolveSpan(wall.spanMm, edge.lengthMm);
    if (positions.end - positions.start < minPieceLengthMm) {
      orphan("spanOutsideEdge");
      continue;
    }
    const spanMm: Interval = {
      fromMm: Math.max(0, positions.start),
      toMm: Math.min(edge.lengthMm, positions.end),
    };
    if (spanMm.toMm - spanMm.fromMm < minPieceLengthMm) {
      orphan("spanOutsideEdge");
      continue;
    }
    const pieces = intersectIntervalWith(spanMm, edge.intervals, minPieceLengthMm);
    if (pieces.length === 0) {
      orphan("notOnBoundary");
      continue;
    }
    const direction = normalizeVec(subVec(edge.end, edge.start));
    const frame: WallEdgeFrame = {
      start: edge.start,
      end: edge.end,
      direction,
      outwardNormal: rightNormal(direction),
      lengthMm: edge.lengthMm,
    };
    const offsets = bandOffsets(wall.alignment, wall.thicknessMm);
    resolved.push({ wall, frame, spanMm, ...offsets });
    for (const piece of pieces) {
      drafts.push({
        wall,
        frame,
        ...offsets,
        fromMm: piece.fromMm,
        toMm: piece.toMm,
        startPoint: addVec(edge.start, scaleVec(direction, piece.fromMm)),
        endPoint: addVec(edge.start, scaleVec(direction, piece.toMm)),
        thicknessMm: wall.thicknessMm,
        curved: false,
        startTangent: direction,
        endTangent: direction,
        interiorFace: {
          kind: "line",
          point: addVec(edge.start, scaleVec(frame.outwardNormal, offsets.interiorOffsetMm)),
          direction,
        },
        exteriorFace: {
          kind: "line",
          point: addVec(edge.start, scaleVec(frame.outwardNormal, offsets.exteriorOffsetMm)),
          direction,
        },
        startCap: null,
        endCap: null,
      });
    }
  }
  joinCorners([...drafts, ...arcEntries.flatMap((entry) => entry.drafts)]);
  const arcWalls: RealWall[] = arcEntries.map((entry) => ({
    ...entry.wall,
    pieces: entry.drafts.flatMap((draft) => arcBandPieces(draft, entry.wall.wallId, areaId)),
  }));
  const realWalls: RealWall[] = resolved.map((entry) => ({
    wallId: entry.wall.id,
    areaId,
    heightMm: entry.wall.heightMm,
    thicknessMm: entry.wall.thicknessMm,
    alignment: entry.wall.alignment,
    interiorOffsetMm: entry.interiorOffsetMm,
    exteriorOffsetMm: entry.exteriorOffsetMm,
    edge: entry.frame,
    spanMm: entry.spanMm,
    arc: null,
    pieces: drafts.filter((draft) => draft.wall === entry.wall).map((draft) => buildPiece(draft, areaId)),
  }));
  // Keep the authored order of walls (arc walls interleaved where they were declared).
  const order = new Map(walls.map((wall, index) => [wall.id, index]));
  const all = [...realWalls, ...arcWalls].sort(
    (a, b) => (order.get(a.wallId) ?? 0) - (order.get(b.wallId) ?? 0),
  );
  return { realWalls: all, orphans };
};
