// Rectangle (Shift: square) in Area Editor: first click a corner, second click (or typed "W x H") the opposite corner.
import { createId } from "@shared/domain/ids";
import { parseLength } from "@shared/domain/units/lengthUnits";
import { formatLength } from "@shared/domain/units/lengthUnits";
import type { Vec2 } from "@shared/geometry/vector";
import { toAreaLocal, toFloor } from "./planGeometry";
import { localRectangleInFloor, splitPair } from "./shapeDrawing";
import { commitNewShape } from "./shapeCommit";
import { finishTool, floorOf, focusArea, unitOf } from "./toolContext";
import { inferFloorPoint } from "../inference/toolInference";
import type { ToolFactory } from "./toolTypes";

export const createRectangleTool = (): ToolFactory => (env) => {
  let start: Vec2 | undefined;
  let current: Vec2 | undefined;
  let square = false;
  let typed = "";
  let screen = { x: 0, y: 0 };

  const typedSize = (): Readonly<{ w: number; h: number }> | undefined => {
    const [first, second] = splitPair(typed);
    const w = parseLength(first, unitOf(env));
    const h = second === undefined ? w : parseLength(second, unitOf(env));
    return w.ok && h.ok && w.millimeters > 0 && h.millimeters > 0
      ? { w: w.millimeters, h: h.millimeters }
      : undefined;
  };

  const corners = (): readonly [Vec2, Vec2] | undefined => {
    if (start === undefined) return undefined;
    const size = typedSize();
    const pointer = current ?? start;
    const sx = Math.sign(pointer.x - start.x) || 1;
    const sy = Math.sign(pointer.y - start.y) || 1;
    if (size !== undefined) return [start, { x: start.x + sx * size.w, y: start.y + sy * size.h }];
    if (square) {
      const side = Math.max(Math.abs(pointer.x - start.x), Math.abs(pointer.y - start.y));
      return [start, { x: start.x + sx * side, y: start.y + sy * side }];
    }
    return [start, pointer];
  };

  const preview = (): void => {
    const area = focusArea(env);
    const box = corners();
    if (area === undefined || box === undefined) return;
    const [a, b] = box;
    env.setOverlay([
      {
        kind: "polygon",
        points: localRectangleInFloor(area, a, b),
        fillOpacity: 0.15,
        outline: true,
        tone: "accent",
      },
    ]);
    const unit = unitOf(env);
    env.setReadout({
      text:
        typed !== ""
          ? `${typed}${typedSize() === undefined ? "  (W x H)" : ""}`
          : `${formatLength(Math.abs(b.x - a.x), unit)} × ${formatLength(Math.abs(b.y - a.y), unit)}`,
      screen,
    });
  };

  const reset = (): void => {
    start = undefined;
    current = undefined;
    typed = "";
    finishTool(env);
  };

  const commit = (): void => {
    const area = focusArea(env);
    const box = corners();
    if (area === undefined || box === undefined) return;
    const [a, b] = box;
    const width = Math.abs(b.x - a.x);
    const height = Math.abs(b.y - a.y);
    reset();
    if (width < 1 || height < 1) return;
    const id = createId("s");
    const shape = {
      id,
      type: "rectangle" as const,
      positionMm: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      rotationDeg: 0,
      widthMm: width,
      heightMm: height,
    };
    commitNewShape(env, area, shape);
  };

  env.setHint(
    "Click a corner, then the opposite corner. Type a size such as 4525 x 1428 and press Enter. Shift draws a square.",
  );
  return {
    isActive: () => start !== undefined,
    pointer: (event) => {
      const area = focusArea(env);
      const floor = floorOf(env);
      if (area === undefined || floor === undefined || event.plan === null) return;
      screen = event.screen;
      square = event.shiftKey;
      const local = toAreaLocal(
        area,
        inferFloorPoint(env, event.plan, start === undefined ? {} : { from: toFloor(area, start) }),
      );
      if (event.phase === "down" && event.button === 0) {
        if (start === undefined) {
          start = local;
          current = local;
        } else {
          current = local;
          commit();
        }
      } else if (event.phase === "move" && start !== undefined) {
        current = local;
        preview();
      }
    },
    key: (event) => {
      if (start === undefined) return false;
      if (event.key === "Escape") reset();
      else if (event.key === "Enter") commit();
      else if (event.key === "Backspace") typed = typed.slice(0, -1);
      else if (event.key.length === 1 && /[0-9a-zA-Z.,x× "'*;-]/.test(event.key)) typed += event.key;
      else return false;
      preview();
      return true;
    },
    cancel: reset,
  };
};
