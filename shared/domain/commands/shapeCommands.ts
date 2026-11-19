// Shape commands for any shape group (area floor, carpet, wall feature). Shape edits never touch walls: walls
// keep their source-edge anchors and are flagged for repair when the edge leaves the boundary (D04). The
// explicit exceptions are a rectangle becoming the equivalent polygon (Corner edit, a whole-room resize), which
// re-anchors walls to the identical edges.
import { current as snapshotOf } from "immer";
import type { Draft } from "immer";
import { applyAffine, invertAffine } from "../../geometry/affine";
import { shapeToAreaAffine } from "../../geometry/placement";
import { validatePolygonPoints } from "../../geometry/polygonValidation";
import { polygonEdgeKey } from "../../geometry/shapeOutline";
import type { Vec2 } from "../../geometry/vector";
import { createId } from "../ids";
import type { AreaValue } from "../schemas/area";
import type { HouseDocument } from "../schemas/house";
import { rectangleEdgeNames } from "../schemas/shapes";
import type { PolygonShapeValue, RectangleShapeValue, ShapeValue } from "../schemas/shapes";
import { defineCommand } from "./command";
import type { Command } from "./command";

const findArea = (
  draft: Draft<HouseDocument>,
  floorId: string,
  areaId: string,
): Draft<AreaValue> | undefined =>
  draft.floors.find((floor) => floor.id === floorId)?.areas.find((area) => area.id === areaId);

/**
 * The shape list a shape command edits: the area's floor shapes, or the shapes of one group. A group is a
 * carpet or a wall feature; IDs are unique across the document, so the group's own ID names it.
 */
const shapeList = (area: Draft<AreaValue>, setId: string | undefined): Draft<ShapeValue>[] | undefined =>
  setId === undefined
    ? area.floor.shapes
    : (area.floor.carpets.find((carpet) => carpet.id === setId)?.shapes ??
      area.walls.flatMap((wall) => wall.reliefs ?? []).find((relief) => relief.id === setId)?.shapes);

export const addShapeCommand = (
  floorId: string,
  areaId: string,
  shape: ShapeValue,
  setId?: string,
): Command =>
  defineCommand(`Add ${shape.type}`, floorId, (draft) => {
    const area = findArea(draft, floorId, areaId);
    if (area === undefined) return "The area no longer exists.";
    const list = shapeList(area, setId);
    if (list === undefined) return "The shape group no longer exists.";
    list.push(structuredClone(shape));
    return undefined;
  });

/** Replaces a shape's geometry (position, rotation, size, vertices) keeping its ID. */
export const replaceShapeCommand = (
  floorId: string,
  areaId: string,
  shape: ShapeValue,
  label: string,
  setId?: string,
): Command =>
  defineCommand(label, floorId, (draft) => {
    const area = findArea(draft, floorId, areaId);
    if (area === undefined) return "The area no longer exists.";
    const list = shapeList(area, setId);
    const index = list?.findIndex((candidate) => candidate.id === shape.id) ?? -1;
    if (list === undefined || index < 0) return "The shape no longer exists.";
    list[index] = structuredClone(shape);
    return undefined;
  });

/**
 * Re-anchors walls on a rectangle's named edges to the vertex-pair edges of the polygon that replaces it (same
 * shape ID, `rectangleAsPolygon` corner order): the identical edges under new names (D04).
 */
const reanchorRectangleWalls = (area: Draft<AreaValue>, polygon: PolygonShapeValue): void => {
  const keys = polygon.vertices.map((vertex, i) =>
    polygonEdgeKey(vertex.id, polygon.vertices[(i + 1) % polygon.vertices.length]?.id ?? vertex.id),
  );
  for (const wall of area.walls) {
    if (wall.sourceEdge.shapeId !== polygon.id) continue;
    const named = rectangleEdgeNames.findIndex((name) => name === wall.sourceEdge.edge);
    const key = keys[named];
    if (key !== undefined) wall.sourceEdge.edge = key;
  }
};

export type ShapeGroupGeometry = Readonly<{
  shapes: readonly ShapeValue[];
  /** A carpet's own placement; ignored for the area floor and a wall feature, which have none. */
  positionMm?: Vec2;
  rotationDeg?: number;
}>;

/**
 * Replaces a shape group's geometry in one step (Phase 7.2: resizing the whole group by its box handles, or
 * turning a carpet): the area floor (`setId` undefined), a carpet, or a wall feature. The group keeps its ID
 * and other properties; shape IDs and polygon vertex IDs are kept by the caller.
 *
 * Area floor (D04): walls stay anchored to their source edges. A rectangle that stays a rectangle keeps its
 * edge names and a polygon keeps its vertex IDs, so anchors carry over unchanged. A rectangle that became a
 * polygon (a turned rectangle scaled on one axis) must use `rectangleAsPolygon`'s corner order (corner i
 * starts edge bottom, right, top, left), and its walls are re-anchored to the matching vertex-pair edges, the
 * same explicit conversion of identical edges as Corner edit. Any other change of shape type is refused.
 */
export const replaceShapeGroupGeometryCommand = (
  floorId: string,
  areaId: string,
  setId: string | undefined,
  geometry: ShapeGroupGeometry,
  label: string,
): Command =>
  defineCommand(label, floorId, (draft) => {
    const area = findArea(draft, floorId, areaId);
    if (area === undefined) return "The area no longer exists.";
    if (geometry.shapes.length === 0) return "A shape group needs at least one shape.";
    if (setId === undefined) {
      const before = new Map(area.floor.shapes.map((shape) => [shape.id, shape.type]));
      for (const shape of geometry.shapes) {
        const was = before.get(shape.id);
        if (was === undefined || was === shape.type) continue;
        if (was !== "rectangle" || shape.type !== "polygon" || shape.vertices.length !== 4)
          return "That resize would change a floor shape's kind; the room is kept as it was.";
        reanchorRectangleWalls(area, shape);
      }
      area.floor.shapes = structuredClone([...geometry.shapes]);
      return undefined;
    }
    const carpet = area.floor.carpets.find((candidate) => candidate.id === setId);
    if (carpet !== undefined) {
      if (geometry.positionMm !== undefined) carpet.positionMm = { ...geometry.positionMm };
      if (geometry.rotationDeg !== undefined) carpet.rotationDeg = geometry.rotationDeg;
      carpet.shapes = structuredClone([...geometry.shapes]);
      return undefined;
    }
    const relief = area.walls
      .flatMap((wall) => wall.reliefs ?? [])
      .find((candidate) => candidate.id === setId);
    if (relief === undefined) return "The shape group no longer exists.";
    relief.shapes = structuredClone([...geometry.shapes]);
    return undefined;
  });

/** Replaces a carpet's placement and pieces in one step (Phase 5.14); the carpet case of the command above. */
export const replaceCarpetGeometryCommand = (
  floorId: string,
  areaId: string,
  carpetId: string,
  geometry: Readonly<{ positionMm: Vec2; rotationDeg: number; shapes: readonly ShapeValue[] }>,
  label: string,
): Command => replaceShapeGroupGeometryCommand(floorId, areaId, carpetId, geometry, label);

/** A rectangle as the equivalent polygon: same ID, placement, and corners; stable new vertex IDs. */
export const rectangleAsPolygon = (shape: RectangleShapeValue): PolygonShapeValue => {
  const hw = shape.widthMm / 2;
  const hh = shape.heightMm / 2;
  // Corner i starts edge rectangleEdgeNames[i] (bottom, right, top, left), counterclockwise.
  const corners = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
  return {
    id: shape.id,
    type: "polygon",
    positionMm: { ...shape.positionMm },
    rotationDeg: shape.rotationDeg,
    vertices: corners.map((corner) => ({ id: createId("v"), x: corner.x, y: corner.y })),
  };
};

/**
 * Corner edit (spec/builder/screens/floor-builder.md#nudge-and-corner-edit-tools): moves one corner to an
 * area-local point. A rectangle becomes the equivalent polygon first, and walls anchored to its named edges
 * are re-anchored to the matching vertex-pair edges in the same command (an explicit conversion of
 * identical edges, D04). Self-intersecting results are rejected.
 */
export const editShapeCornerCommand = (
  floorId: string,
  areaId: string,
  shapeId: string,
  cornerIndex: number,
  areaPoint: Vec2,
  setId?: string,
): Command =>
  defineCommand("Edit corner", floorId, (draft) => {
    const area = findArea(draft, floorId, areaId);
    if (area === undefined) return "The area no longer exists.";
    const list = shapeList(area, setId);
    const index = list?.findIndex((candidate) => candidate.id === shapeId) ?? -1;
    const shape = list?.[index];
    if (list === undefined || shape === undefined) return "The shape no longer exists.";
    if (shape.type === "circle") return "Circles have no corners.";
    const polygon = shape.type === "rectangle" ? rectangleAsPolygon(shape) : snapshotOf(shape);
    if (shape.type === "rectangle" && setId === undefined) {
      reanchorRectangleWalls(area, polygon);
    }
    const vertex = polygon.vertices[cornerIndex];
    if (vertex === undefined) return "That corner no longer exists.";
    const local = applyAffine(invertAffine(shapeToAreaAffine(polygon)), areaPoint);
    const vertices = polygon.vertices.map((candidate, i) =>
      i === cornerIndex ? { ...candidate, x: local.x, y: local.y } : candidate,
    );
    if (!validatePolygonPoints(vertices).valid)
      return "That corner position would make the shape cross itself; the last valid shape is kept.";
    list[index] = { ...polygon, vertices };
    return undefined;
  });
