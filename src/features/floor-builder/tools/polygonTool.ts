// Polygon pencil (D04): click vertices; type a length to place the next vertex along the pointer direction;
// close on the start vertex or with Enter (≥ 3 non-collinear points); Backspace removes the last vertex;
// Escape cancels. Self-intersections are rejected with feedback.
import { createId } from "@shared/domain/ids";
import { validatePolygonPoints } from "@shared/geometry/polygonValidation";
import type { Vec2 } from "@shared/geometry/vector";
import { toAreaLocal, toFloor } from "./planGeometry";

import { inferAxis, snapCapturePx } from "./snapping";
import { commitNewShape } from "./shapeCommit";
import { finishTool, floorOf, focusArea, magnetic, unitOf } from "./toolContext";
import { inferFloorPoint } from "../inference/toolInference";
import type { InferPointOptions } from "../inference/inferPoint";
import type { AreaValue } from "@shared/domain/schemas/area";
import type { ToolFactory } from "./toolTypes";
import { createValueInput, feedValueKey, hasTyped, readoutOf, valueOf } from "./valueInput";

const problemText = (kind: string): string =>
  kind === "selfIntersection"
    ? "The outline crosses itself."
    : kind === "collinear"
      ? "The points are on one line."
      : kind === "duplicateVertex"
        ? "Two vertices are at the same place."
        : "A polygon needs at least three points.";

export const createPolygonTool = (): ToolFactory => (env) => {
  const vertices: Vec2[] = [];
  let pointer: Vec2 | undefined;
  let screen = { x: 0, y: 0 };
  const input = createValueInput("length");

  const lastVertexFrom = (area: AreaValue): InferPointOptions => {
    const last = vertices[vertices.length - 1];
    return last === undefined ? {} : { from: toFloor(area, last) };
  };

  const nextPoint = (): Vec2 | undefined => {
    const last = vertices[vertices.length - 1];
    if (last === undefined || pointer === undefined) return pointer;
    const raw = { x: pointer.x - last.x, y: pointer.y - last.y };
    const length = Math.hypot(raw.x, raw.y);
    if (length === 0) return pointer;
    const previous = vertices[vertices.length - 2];
    const direction = magnetic(env)
      ? inferAxis(
          raw,
          previous === undefined
            ? []
            : [
                { x: last.x - previous.x, y: last.y - previous.y },
                { x: -(last.y - previous.y), y: last.x - previous.x },
              ],
        )
      : { x: raw.x / length, y: raw.y / length };
    const distance = valueOf(
      input,
      hasTyped(input) ? length : raw.x * direction.x + raw.y * direction.y,
      unitOf(env),
    );
    return { x: last.x + direction.x * distance, y: last.y + direction.y * distance };
  };

  const preview = (): void => {
    const area = focusArea(env);
    if (area === undefined) return;
    const next = nextPoint();
    const points = [...vertices, ...(next === undefined ? [] : [next])].map((point) => toFloor(area, point));
    const first = vertices[0];
    env.setOverlay([
      { kind: "polyline", points, tone: "accent" },
      ...vertices.map((vertex) => ({
        kind: "point" as const,
        at: toFloor(area, vertex),
        marker: "dot" as const,
        tone: "accent" as const,
      })),
      ...(first === undefined
        ? []
        : [
            {
              kind: "point" as const,
              at: toFloor(area, first),
              marker: "cross" as const,
              sizePx: 14,
              tone: "accent" as const,
            },
          ]),
    ]);
    const last = vertices[vertices.length - 1];
    if (last !== undefined && next !== undefined)
      env.setReadout({
        text: readoutOf(input, Math.hypot(next.x - last.x, next.y - last.y), unitOf(env)),
        screen,
      });
  };

  const reset = (): void => {
    vertices.length = 0;
    pointer = undefined;
    input.typed = "";
    finishTool(env);
  };

  const close = (): void => {
    const area = focusArea(env);
    if (area === undefined) return;
    const validation = validatePolygonPoints(vertices);
    if (!validation.valid) {
      env.session.notify("warning", problemText(validation.problems[0]?.kind ?? "tooFewPoints"));
      return;
    }
    const minX = Math.min(...vertices.map((vertex) => vertex.x));
    const maxX = Math.max(...vertices.map((vertex) => vertex.x));
    const minY = Math.min(...vertices.map((vertex) => vertex.y));
    const maxY = Math.max(...vertices.map((vertex) => vertex.y));
    const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    const signed = vertices.reduce((sum, vertex, index) => {
      const next = vertices[(index + 1) % vertices.length] ?? vertex;
      return sum + vertex.x * next.y - next.x * vertex.y;
    }, 0);
    const ordered = signed < 0 ? [...vertices].reverse() : [...vertices];
    const id = createId("s");
    const shape = {
      id,
      type: "polygon" as const,
      positionMm: center,
      rotationDeg: 0,
      vertices: ordered.map((vertex) => ({
        id: createId("v"),
        x: vertex.x - center.x,
        y: vertex.y - center.y,
      })),
    };
    reset();
    commitNewShape(env, area, shape);
  };

  const addVertex = (): void => {
    const next = nextPoint();
    if (next === undefined) return;
    const first = vertices[0];
    if (
      first !== undefined &&
      vertices.length >= 3 &&
      Math.hypot(next.x - first.x, next.y - first.y) <= snapCapturePx * env.runtime.worldUnitsPerPixel()
    ) {
      close();
      return;
    }
    const candidate = [...vertices, next];
    if (candidate.length >= 4) {
      const check = validatePolygonPoints(candidate);
      if (!check.valid && check.problems.some((problem) => problem.kind === "selfIntersection")) {
        env.session.notify("warning", problemText("selfIntersection"));
        return;
      }
    }
    vertices.push(next);
    input.typed = "";
    preview();
  };

  env.setHint(
    "Click vertices. Type a length for the next side. Click the first vertex or press Enter to close; Backspace removes the last vertex.",
  );
  return {
    isActive: () => vertices.length > 0,
    pointer: (event) => {
      const area = focusArea(env);
      const floor = floorOf(env);
      if (area === undefined || floor === undefined || event.plan === null) return;
      screen = event.screen;
      pointer = toAreaLocal(area, inferFloorPoint(env, event.plan, lastVertexFrom(area)));
      if (event.phase === "down" && event.button === 0) addVertex();
      else if (event.phase === "move" && vertices.length > 0) preview();
    },
    key: (event) => {
      if (vertices.length === 0) return false;
      if (event.key === "Enter" && !hasTyped(input)) {
        close();
        return true;
      }
      if (event.key === "Backspace" && !hasTyped(input)) {
        vertices.pop();
        preview();
        return true;
      }
      const action = feedValueKey(input, event.key);
      if (action === "cancel") reset();
      else if (action === "commit") addVertex();
      else if (action === "consumed") preview();
      return action !== "none";
    },
    cancel: reset,
  };
};
