// Wall Editor handles (spec/builder/screens/floor-builder.md#wall-handles-and-hover), hit-tested on screen
// against their 3D geometry, never through the floor plane: a wall's top edges (push/pull height), its two
// vertical end lines (trim/extend), and bare floor-shape edges (raise a new wall from 0).
import type { AreaValue } from "@shared/domain/schemas/area";
import { computeAreaFloorGeometry } from "@shared/geometry/areaGeometry";
import { wallPointAt } from "@shared/geometry/wallBands";
import type { Vec2 } from "@shared/geometry/vector";
import type { OverlayPrimitive, PickHit, PlanPoint3, ScreenPoint } from "../../../renderer/runtimeTypes";
import type { BoundaryPieceRef, WallEndLine } from "./planGeometry";
import { barePieces, boundaryPieces, wallEndLines } from "./planGeometry";
import type { ToolEnv, ViewportCursor } from "./toolTypes";

export type WallHandleKind = "top" | "end" | "bare";

export type WallHandle =
  | Readonly<{
      kind: "top";
      wallId: string;
      heightMm: number;
      /** Plan point on the wall (middle of its span): the vertical line push/pull measures along. */
      at: Vec2;
      /** Top edges of the band faces, floor mm at the wall's height. */
      edges: readonly (readonly [Vec2, Vec2])[];
    }>
  | Readonly<{ kind: "end"; wallId: string; heightMm: number; line: WallEndLine; corners: readonly Vec2[] }>
  | Readonly<{ kind: "bare"; piece: BoundaryPieceRef }>;

/** Screen distance (CSS px) within which a handle counts as hovered. */
export const handleCapturePx = 8;
/** A pick on a wall's own surface makes its handles win ties against handles of walls behind it. */
const pickedWallBonusPx = 3;

const segmentDistance = (point: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
};

const projectedDistance = (env: ToolEnv, screen: ScreenPoint, a: PlanPoint3, b: PlanPoint3): number => {
  const sa = env.runtime.screenPointOf(a);
  const sb = env.runtime.screenPointOf(b);
  return sa === null || sb === null ? Number.POSITIVE_INFINITY : segmentDistance(screen, sa, sb);
};

/** Every handle of the area, optionally limited to some kinds. */
export const wallHandlesOf = (area: AreaValue, kinds: readonly WallHandleKind[]): readonly WallHandle[] => {
  const handles: WallHandle[] = [];
  const geometry = computeAreaFloorGeometry(area);
  const ends = wallEndLines(area);
  for (const realWall of geometry.realWalls) {
    const faces = realWall.pieces.flatMap((piece) => piece.faces);
    if (kinds.includes("top")) {
      handles.push({
        kind: "top",
        wallId: realWall.wallId,
        heightMm: realWall.heightMm,
        at: wallPointAt(realWall, (realWall.spanMm.fromMm + realWall.spanMm.toMm) / 2).point,
        edges: faces.filter((face) => face.ref.side !== "end").map((face) => [face.start, face.end] as const),
      });
    }
    if (kinds.includes("end")) {
      const endFaces = faces.filter((face) => face.ref.side === "end");
      for (const line of ends.filter((candidate) => candidate.wallId === realWall.wallId)) {
        const nearFace = endFaces.filter(
          (face) =>
            Math.min(
              Math.hypot(face.start.x - line.point.x, face.start.y - line.point.y),
              Math.hypot(face.end.x - line.point.x, face.end.y - line.point.y),
            ) <=
            realWall.thicknessMm + 1,
        );
        handles.push({
          kind: "end",
          wallId: realWall.wallId,
          heightMm: realWall.heightMm,
          line,
          corners: [line.point, ...nearFace.flatMap((face) => [face.start, face.end])],
        });
      }
    }
  }
  if (kinds.includes("bare"))
    for (const piece of boundaryPieces(area).flatMap((candidate) => barePieces(area, candidate)))
      handles.push({ kind: "bare", piece });
  return handles;
};

/** Screen distance from the pointer to a handle's projected 3D geometry. */
const handleDistance = (env: ToolEnv, handle: WallHandle, screen: ScreenPoint): number => {
  if (handle.kind === "top")
    return Math.min(
      ...handle.edges.map(([a, b]) =>
        projectedDistance(env, screen, { ...a, h: handle.heightMm }, { ...b, h: handle.heightMm }),
      ),
    );
  if (handle.kind === "end")
    return Math.min(
      ...handle.corners.map((corner) =>
        projectedDistance(env, screen, { ...corner, h: 0 }, { ...corner, h: handle.heightMm }),
      ),
    );
  const points = handle.piece.points;
  return Math.min(
    ...points
      .slice(1)
      .map((point, index) =>
        projectedDistance(env, screen, { ...(points[index] ?? point), h: 0 }, { ...point, h: 0 }),
      ),
  );
};

const handleWallId = (handle: WallHandle): string | undefined =>
  handle.kind === "bare" ? undefined : handle.wallId;

/** The handle under the pointer, if any. End lines win ties over top edges at the corners. */
export const handleAt = (
  env: ToolEnv,
  handles: readonly WallHandle[],
  screen: ScreenPoint,
  hit: PickHit | null,
): WallHandle | undefined => {
  const pickedWall = hit?.kind === "wall" ? hit.wallId : undefined;
  let best: WallHandle | undefined;
  let bestScore = handleCapturePx;
  for (const handle of handles) {
    const bonus = pickedWall !== undefined && handleWallId(handle) === pickedWall ? pickedWallBonusPx : 0;
    const tie = handle.kind === "end" ? 0.5 : 0;
    const score = handleDistance(env, handle, screen) - bonus - tie;
    if (score <= bestScore) {
      best = handle;
      bestScore = score;
    }
  }
  if (best === undefined && hit?.kind === "wall" && hit.side === "top")
    return handles.find((handle) => handle.kind === "top" && handle.wallId === hit.wallId);
  return best;
};

/** Highlight for a hovered handle. */
export const handleOverlay = (handle: WallHandle): readonly OverlayPrimitive[] => {
  if (handle.kind === "top")
    return handle.edges.map(([a, b]) => ({
      kind: "segment",
      from: { ...a, h: handle.heightMm },
      to: { ...b, h: handle.heightMm },
      tone: "accent",
    }));
  if (handle.kind === "end")
    return handle.corners.map((corner) => ({
      kind: "verticalLine",
      at: corner,
      fromHMm: 0,
      toHMm: handle.heightMm,
      tone: "accent",
    }));
  return [{ kind: "polyline", points: handle.piece.points, tone: "accent" }];
};

export const handleCursor = (handle: WallHandle | undefined): ViewportCursor =>
  handle === undefined ? "default" : handle.kind === "end" ? "trim" : "pushPull";
