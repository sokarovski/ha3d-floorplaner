// Wall commands: raise from boundary pieces, trim/extend span, remove by push-through, split, extend past a
// corner, reassign an orphan (spec/builder/screens/floor-builder.md#mode-3-wall-editor, D04).
// Positions passed in are millimetres from the source edge's start vertex; spans are stored with their ends
// attached to the edge's corners (D04, Phase 3), so walls follow the floor when it is resized.
import { current as snapshotOf } from "immer";
import type { Draft } from "immer";
import { reliefBounds } from "../../geometry/reliefStrips";
import { createWall } from "../house/defaults";
import { nearerCorner, resolveSpan, sourceEdgeLength, spanEndAt, spanFromPositions } from "../house/wallSpan";
import type { ResolvedSpan } from "../house/wallSpan";
import { createId } from "../ids";
import type { AreaValue } from "../schemas/area";
import type { HouseDocument } from "../schemas/house";
import type { WallValue, WallReliefValue } from "../schemas/wall";
import { defineCommand } from "./command";
import type { Command } from "./command";

/** Where a feature's combined outline starts along the wall (mm from the span start). */
const reliefStartMm = (relief: Readonly<WallReliefValue>): number => reliefBounds(relief.shapes)?.minX ?? 0;

/** Moves a feature along its wall: every shape of the group moves with it. */
const shiftRelief = (relief: Draft<WallReliefValue>, deltaMm: number): void => {
  for (const shape of relief.shapes) shape.positionMm.x += deltaMm;
};

/** Spans shorter than this remove the wall (push-through). */
export const minWallSpanMm = 1;

const findArea = (
  draft: Draft<HouseDocument>,
  floorId: string,
  areaId: string,
): Draft<AreaValue> | undefined =>
  draft.floors.find((floor) => floor.id === floorId)?.areas.find((area) => area.id === areaId);

export type WallPieceRequest = Readonly<{ shapeId: string; edgeKey: string; fromMm: number; toMm: number }>;

/** Settings new walls copy: the first selected/template wall, else the area's first wall, else defaults. */
export type WallSettings = Pick<WallValue, "thicknessMm" | "alignment" | "materials">;

const overlaps = (span: ResolvedSpan, fromMm: number, toMm: number): boolean =>
  span.start < toMm - minWallSpanMm && fromMm < span.end - minWallSpanMm;

const edgeLength = (area: Draft<AreaValue>, shapeId: string, edgeKey: string): number | undefined =>
  sourceEdgeLength(area.floor.shapes, { sourceEdge: { shapeId, edge: edgeKey } });

const resolvedOf = (area: Draft<AreaValue>, wall: Draft<WallValue>): ResolvedSpan | undefined => {
  const length = edgeLength(area, wall.sourceEdge.shapeId, wall.sourceEdge.edge);
  return length === undefined ? undefined : resolveSpan(wall.spanMm, length);
};

const edgeOccupied = (
  area: Draft<AreaValue>,
  shapeId: string,
  edgeKey: string,
  fromMm: number,
  toMm: number,
  exceptId?: string,
): boolean =>
  area.walls.some((existing) => {
    if (
      existing.id === exceptId ||
      existing.sourceEdge.shapeId !== shapeId ||
      existing.sourceEdge.edge !== edgeKey
    )
      return false;
    const span = resolvedOf(area, existing);
    return span !== undefined && overlaps(span, fromMm, toMm);
  });

/** Raises one wall per requested boundary piece that has no wall yet (bare stretches only). */
export const raiseWallsCommand = (
  floorId: string,
  areaId: string,
  pieces: readonly WallPieceRequest[],
  heightMm: number,
  settings: WallSettings | undefined,
): Readonly<{ command: Command; wallIds: readonly string[] }> => {
  const planned = pieces
    .filter((piece) => piece.toMm - piece.fromMm >= minWallSpanMm)
    .map((piece) => ({ piece, id: createId("w") }));
  return {
    wallIds: planned.map((entry) => entry.id),
    command: defineCommand(
      planned.length > 1 ? `Raise ${String(planned.length)} walls` : "Raise wall",
      floorId,
      (draft) => {
        const area = findArea(draft, floorId, areaId);
        if (area === undefined) return "The area no longer exists.";
        for (const { piece, id } of planned) {
          const length = edgeLength(area, piece.shapeId, piece.edgeKey);
          if (length === undefined) return "That edge cannot hold a wall.";
          if (edgeOccupied(area, piece.shapeId, piece.edgeKey, piece.fromMm, piece.toMm)) continue;
          const wall = createWall(piece.shapeId, piece.edgeKey, heightMm);
          wall.id = id;
          wall.spanMm = spanFromPositions(piece.fromMm, piece.toMm, length);
          if (settings !== undefined) {
            wall.thicknessMm = settings.thicknessMm;
            wall.alignment = settings.alignment;
            wall.materials = structuredClone(settings.materials);
          }
          area.walls.push(wall);
        }
        return undefined;
      },
    ),
  };
};

/**
 * Fill walls (Phase 4.4): replace all of an area's walls with one wall per boundary piece of its floor
 * outline (straight edges and circle arcs), ends attached to the corners, at `heightMm`. Openings on the
 * removed walls go with them. One command; Undo restores everything.
 */
export const fillWallsCommand = (
  floorId: string,
  areaId: string,
  pieces: readonly WallPieceRequest[],
  heightMm: number,
  settings: WallSettings | undefined,
): Readonly<{ command: Command; wallIds: readonly string[] }> => {
  const planned = pieces
    .filter((piece) => piece.toMm - piece.fromMm >= minWallSpanMm)
    .map((piece) => ({ piece, id: createId("w") }));
  return {
    wallIds: planned.map((entry) => entry.id),
    command: defineCommand("Fill walls", floorId, (draft) => {
      const area = findArea(draft, floorId, areaId);
      if (area === undefined) return "The area no longer exists.";
      if (planned.length === 0) return "This room has no outline to wall.";
      area.walls.splice(0, area.walls.length);
      for (const { piece, id } of planned) {
        const length = edgeLength(area, piece.shapeId, piece.edgeKey);
        if (length === undefined) return "That edge cannot hold a wall.";
        const wall = createWall(piece.shapeId, piece.edgeKey, heightMm);
        wall.id = id;
        wall.spanMm = spanFromPositions(piece.fromMm, piece.toMm, length);
        if (settings !== undefined) {
          wall.thicknessMm = settings.thicknessMm;
          wall.alignment = settings.alignment;
          wall.materials = structuredClone(settings.materials);
        }
        area.walls.push(wall);
      }
      return undefined;
    }),
  };
};

/** Trim or extend along the same edge (positions from the edge start). Pushing one end onto the other removes the wall. */
export const setWallSpanCommand = (
  floorId: string,
  areaId: string,
  wallId: string,
  startMm: number,
  endMm: number,
): Command =>
  defineCommand(Math.abs(endMm - startMm) < minWallSpanMm ? "Remove wall" : "Trim wall", floorId, (draft) => {
    const area = findArea(draft, floorId, areaId);
    const index = area?.walls.findIndex((wall) => wall.id === wallId) ?? -1;
    const wall = area?.walls[index];
    if (area === undefined || wall === undefined) return "The wall no longer exists.";
    const length = edgeLength(area, wall.sourceEdge.shapeId, wall.sourceEdge.edge);
    const current = resolvedOf(area, wall);
    if (length === undefined || current === undefined)
      return "The wall's edge is missing; reassign or delete it.";
    const start = Math.max(0, Math.min(startMm, endMm));
    const end = Math.min(length, Math.max(startMm, endMm));
    if (end - start < minWallSpanMm) {
      area.walls.splice(index, 1);
      return undefined;
    }
    if (edgeOccupied(area, wall.sourceEdge.shapeId, wall.sourceEdge.edge, start, end, wall.id))
      return "Walls on the same edge cannot overlap.";
    const shift = start - current.start;
    wall.spanMm = spanFromPositions(start, end, length);
    for (const opening of wall.objects) opening.placement.distanceAlongWallMm -= shift;
    for (const relief of wall.reliefs ?? []) shiftRelief(relief, -shift);
    return undefined;
  });

/** Splits a wall at a distance from its span start; openings go to the half containing their center. */
export const splitWallCommand = (
  floorId: string,
  areaId: string,
  wallId: string,
  atMm: number,
): Readonly<{ command: Command; newWallId: string }> => {
  const newWallId = createId("w");
  return {
    newWallId,
    command: defineCommand("Split wall", floorId, (draft) => {
      const area = findArea(draft, floorId, areaId);
      const wall = area?.walls.find((candidate) => candidate.id === wallId);
      if (area === undefined || wall === undefined) return "The wall no longer exists.";
      const length = edgeLength(area, wall.sourceEdge.shapeId, wall.sourceEdge.edge);
      const current = resolvedOf(area, wall);
      if (length === undefined || current === undefined)
        return "The wall's edge is missing; reassign or delete it.";
      if (atMm < minWallSpanMm || atMm > current.end - current.start - minWallSpanMm)
        return "Split inside the wall, away from its ends.";
      const splitAt = current.start + atMm;
      const corner = nearerCorner(splitAt, length);
      const plain = snapshotOf(wall);
      const second: Draft<WallValue> = {
        ...structuredClone(plain),
        id: newWallId,
        spanMm: { start: spanEndAt(splitAt, length, corner), end: structuredClone(plain.spanMm.end) },
        objects: plain.objects
          .filter((opening) => opening.placement.distanceAlongWallMm >= atMm)
          .map((opening) => ({
            ...structuredClone(opening),
            placement: {
              ...opening.placement,
              distanceAlongWallMm: opening.placement.distanceAlongWallMm - atMm,
            },
          })),
        // A relief stays whole, on the half that holds its start (Phase 5.0).
        reliefs: (plain.reliefs ?? [])
          .filter((relief) => reliefStartMm(relief) >= atMm)
          .map((relief) => {
            const moved = structuredClone(relief);
            shiftRelief(moved, -atMm);
            return moved;
          }),
      };
      wall.objects = wall.objects.filter((opening) => opening.placement.distanceAlongWallMm < atMm);
      if (wall.reliefs !== undefined)
        wall.reliefs = wall.reliefs.filter((relief) => reliefStartMm(relief) < atMm);
      wall.spanMm.end = spanEndAt(splitAt, length, corner);
      area.walls.splice(area.walls.indexOf(wall) + 1, 0, second);
      return undefined;
    }),
  };
};

/** Extending an open end past a corner: attaches the wall to that corner and adds a section on the next edge. */
export const extendPastCornerCommand = (
  floorId: string,
  areaId: string,
  wallId: string,
  keepStart: boolean,
  next: WallPieceRequest,
): Readonly<{ command: Command; newWallId: string }> => {
  const newWallId = createId("w");
  return {
    newWallId,
    command: defineCommand("Extend wall around corner", floorId, (draft) => {
      const area = findArea(draft, floorId, areaId);
      const wall = area?.walls.find((candidate) => candidate.id === wallId);
      if (area === undefined || wall === undefined) return "The wall no longer exists.";
      const current = resolvedOf(area, wall);
      const nextLength = edgeLength(area, next.shapeId, next.edgeKey);
      if (current === undefined || nextLength === undefined) return "These edges cannot hold walls.";
      if (keepStart) wall.spanMm.end = { anchor: "end", offsetMm: 0 };
      else {
        for (const opening of wall.objects) opening.placement.distanceAlongWallMm += current.start;
        for (const relief of wall.reliefs ?? []) shiftRelief(relief, current.start);
        wall.spanMm.start = { anchor: "start", offsetMm: 0 };
      }
      if (edgeOccupied(area, next.shapeId, next.edgeKey, next.fromMm, next.toMm))
        return "The next edge already has a wall there.";
      area.walls.push({
        ...structuredClone(snapshotOf(wall)),
        id: newWallId,
        sourceEdge: { shapeId: next.shapeId, edge: next.edgeKey },
        spanMm: spanFromPositions(next.fromMm, next.toMm, nextLength),
        objects: [],
        reliefs: [],
      });
      return undefined;
    }),
  };
};

/** Orphan repair: anchor a flagged wall to another boundary edge (D04: never silently). */
export const reassignWallCommand = (
  floorId: string,
  areaId: string,
  wallId: string,
  piece: WallPieceRequest,
): Command =>
  defineCommand("Reassign wall", floorId, (draft) => {
    const area = findArea(draft, floorId, areaId);
    const wall = area?.walls.find((candidate) => candidate.id === wallId);
    if (area === undefined || wall === undefined) return "The wall no longer exists.";
    const length = edgeLength(area, piece.shapeId, piece.edgeKey);
    if (length === undefined) return "That edge cannot hold a wall.";
    wall.sourceEdge = { shapeId: piece.shapeId, edge: piece.edgeKey };
    wall.spanMm = spanFromPositions(piece.fromMm, piece.toMm, length);
    return undefined;
  });

/** Adds a wall feature (a group of 2D shapes) to a wall face. */
export const addReliefCommand = (
  floorId: string,
  areaId: string,
  wallId: string,
  relief: WallReliefValue,
): Command =>
  defineCommand(`Add ${relief.name}`, floorId, (draft) => {
    const wall = findArea(draft, floorId, areaId)?.walls.find((candidate) => candidate.id === wallId);
    if (wall === undefined) return "The wall no longer exists.";
    wall.reliefs = [...(wall.reliefs ?? []), structuredClone(relief)];
    return undefined;
  });

/** Patches a wall feature's depth or face in one step (shapes change through the shape commands). */
export const updateReliefCommand = (
  floorId: string,
  areaId: string,
  wallId: string,
  reliefId: string,
  patch: Readonly<Partial<Pick<WallReliefValue, "depthMm" | "face">>>,
  label: string,
): Command =>
  defineCommand(label, floorId, (draft) => {
    const relief = findArea(draft, floorId, areaId)
      ?.walls.find((candidate) => candidate.id === wallId)
      ?.reliefs?.find((candidate) => candidate.id === reliefId);
    if (relief === undefined) return "The wall feature no longer exists.";
    Object.assign(relief, patch);
    return undefined;
  });

/** Moves a whole wall feature on its face: every shape of the group shifts by the same amount. */
export const moveReliefCommand = (
  floorId: string,
  areaId: string,
  wallId: string,
  reliefId: string,
  delta: Readonly<{ x: number; y: number }>,
  label: string,
): Command =>
  defineCommand(label, floorId, (draft) => {
    const relief = findArea(draft, floorId, areaId)
      ?.walls.find((candidate) => candidate.id === wallId)
      ?.reliefs?.find((candidate) => candidate.id === reliefId);
    if (relief === undefined) return "The wall feature no longer exists.";
    for (const shape of relief.shapes) {
      shape.positionMm.x += delta.x;
      shape.positionMm.y += delta.y;
    }
    return undefined;
  });
