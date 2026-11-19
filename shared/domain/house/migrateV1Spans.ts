// Migration v1 → v2 (Phase 3, D04): wall spans stored as absolute millimetres from the edge start become
// corner-attached ends. An end within the tolerance of 0 or of the edge length attaches to that corner; any
// other end keeps its absolute position as { anchor: "start", offsetMm }.
import { shapeEdgeLength } from "../../geometry/shapeOutline";
import { Shape } from "../schemas/shapes";
import type { ShapeValue } from "../schemas/shapes";
import { compileValidator } from "../validation/ajv";
import { cornerAttachToleranceMm } from "./wallSpan";

type JsonObject = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

const endFor = (position: number, edgeLength: number | undefined, side: "start" | "end"): JsonObject => {
  if (Math.abs(position) <= cornerAttachToleranceMm) return { anchor: "start", offsetMm: 0 };
  if (edgeLength !== undefined && Math.abs(edgeLength - position) <= cornerAttachToleranceMm)
    return { anchor: "end", offsetMm: 0 };
  if (edgeLength !== undefined && side === "end")
    return { anchor: "end", offsetMm: Math.max(0, edgeLength - position) };
  return { anchor: "start", offsetMm: Math.max(0, position) };
};

const migrateWall = (wall: unknown, shapes: readonly ShapeValue[]): unknown => {
  if (!isObject(wall)) return wall;
  const span = wall.spanMm;
  const sourceEdge = wall.sourceEdge;
  if (!isObject(span) || !isObject(sourceEdge)) return wall;
  const { start, end } = span;
  if (typeof start !== "number" || typeof end !== "number") return wall;
  const shape = shapes.find((candidate) => candidate.id === sourceEdge.shapeId);
  const edgeKey = sourceEdge.edge;
  const length =
    shape === undefined || typeof edgeKey !== "string"
      ? undefined
      : (shapeEdgeLength(shape, edgeKey) ?? undefined);
  return {
    ...wall,
    spanMm: {
      start: endFor(Math.min(start, end), length, "start"),
      end: endFor(Math.max(start, end), length, "end"),
    },
  };
};

const migrateArea = (area: unknown): unknown => {
  if (!isObject(area) || !isObject(area.floor)) return area;
  const isShape = compileValidator(Shape);
  const shapes = list(area.floor.shapes).filter((shape): shape is ShapeValue => isShape(shape));
  return { ...area, walls: list(area.walls).map((wall) => migrateWall(wall, shapes)) };
};

export const migrateWallSpansV1 = (document: JsonObject): JsonObject => ({
  ...document,
  floors: list(document.floors).map((floor) =>
    isObject(floor) ? { ...floor, areas: list(floor.areas).map(migrateArea) } : floor,
  ),
});
