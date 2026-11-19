// Wall spans attached to edge corners (D04, Phase 3). Positions are millimetres from the source edge's start
// vertex; span ends are stored relative to a corner so walls follow the floor when it is resized.
import { shapeEdgeLength } from "../../geometry/shapeOutline";
import type { ShapeValue } from "../schemas/shapes";
import type { SpanEndValue, WallValue } from "../schemas/wall";

/** Ends this close to a corner attach to it (matches the geometry join tolerance). */
export const cornerAttachToleranceMm = 0.05;

export type ResolvedSpan = Readonly<{ start: number; end: number }>;

export const spanEndPosition = (end: SpanEndValue, edgeLengthMm: number): number =>
  end.anchor === "start" ? end.offsetMm : edgeLengthMm - end.offsetMm;

/** The span in millimetres from the edge start for the edge's current length (may be crossed after a shrink). */
export const resolveSpan = (span: WallValue["spanMm"], edgeLengthMm: number): ResolvedSpan => ({
  start: spanEndPosition(span.start, edgeLengthMm),
  end: spanEndPosition(span.end, edgeLengthMm),
});

const clean = (value: number): number => Math.round(Math.max(0, value) * 1e6) / 1e6;

/** An end at a position, attached to the given corner (snapping to it within the tolerance). */
export const spanEndAt = (
  positionMm: number,
  edgeLengthMm: number,
  anchor: "start" | "end",
): SpanEndValue => {
  if (Math.abs(positionMm) <= cornerAttachToleranceMm) return { anchor: "start", offsetMm: 0 };
  if (Math.abs(edgeLengthMm - positionMm) <= cornerAttachToleranceMm) return { anchor: "end", offsetMm: 0 };
  return anchor === "start"
    ? { anchor, offsetMm: clean(positionMm) }
    : { anchor, offsetMm: clean(edgeLengthMm - positionMm) };
};

/** The corner nearer to a position. */
export const nearerCorner = (positionMm: number, edgeLengthMm: number): "start" | "end" =>
  positionMm <= edgeLengthMm / 2 ? "start" : "end";

/** A span from resolved positions: the start end attaches to the start corner, the end end to the end corner. */
export const spanFromPositions = (
  startMm: number,
  endMm: number,
  edgeLengthMm: number,
): WallValue["spanMm"] => ({
  start: spanEndAt(startMm, edgeLengthMm, "start"),
  end: spanEndAt(endMm, edgeLengthMm, "end"),
});

export const fullEdgeSpan = (): WallValue["spanMm"] => ({
  start: { anchor: "start", offsetMm: 0 },
  end: { anchor: "end", offsetMm: 0 },
});

/** The current length of a wall's source edge, or undefined when the shape or edge is missing. */
export const sourceEdgeLength = (
  shapes: readonly ShapeValue[],
  wall: Pick<WallValue, "sourceEdge">,
): number | undefined => {
  const shape = shapes.find((candidate) => candidate.id === wall.sourceEdge.shapeId);
  const length = shape === undefined ? null : shapeEdgeLength(shape, wall.sourceEdge.edge);
  return length ?? undefined;
};
