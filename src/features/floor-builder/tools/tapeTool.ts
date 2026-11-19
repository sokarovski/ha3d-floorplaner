// Measuring tape: click a start point, then an end point (or type a distance). Creates a guide line through both
// points, or a guide point at the end when Alt is held (Guide line / Guide point, D16).
import { addGuideCommand } from "@shared/domain/commands/guideCommands";
import type { Vec2 } from "@shared/geometry/vector";

import { inferAxis } from "./snapping";
import { finishTool, floorOf, magnetic, unitOf } from "./toolContext";
import { inferFloorPoint } from "../inference/toolInference";
import type { ToolFactory } from "./toolTypes";
import { createValueInput, feedValueKey, hasTyped, readoutOf, valueOf } from "./valueInput";

export const createTapeTool = (): ToolFactory => (env) => {
  let start: Vec2 | undefined;
  let pointer: Vec2 | undefined;
  let pointMode = false;
  let screen = { x: 0, y: 0 };
  const input = createValueInput("length");

  const end = (): Vec2 | undefined => {
    if (start === undefined || pointer === undefined) return undefined;
    const raw = { x: pointer.x - start.x, y: pointer.y - start.y };
    const length = Math.hypot(raw.x, raw.y);
    if (length === 0) return pointer;
    const direction =
      magnetic(env) && !hasTyped(input) ? inferAxis(raw, []) : { x: raw.x / length, y: raw.y / length };
    const pointerDistance = raw.x * direction.x + raw.y * direction.y;
    const distance = valueOf(input, pointerDistance, unitOf(env));
    return { x: start.x + direction.x * distance, y: start.y + direction.y * distance };
  };

  const preview = (): void => {
    const b = end();
    if (start === undefined || b === undefined) return;
    env.setOverlay([
      { kind: "segment", from: start, to: b, dashed: true, tone: "guide" },
      { kind: "point", at: start, marker: "cross", tone: "guide" },
      { kind: "point", at: b, marker: "cross", tone: "guide" },
    ]);
    env.setReadout({
      text: `${readoutOf(input, Math.hypot(b.x - start.x, b.y - start.y), unitOf(env))}${pointMode ? "  · guide point" : "  · guide line"}`,
      screen,
    });
  };

  const reset = (): void => {
    start = undefined;
    pointer = undefined;
    input.typed = "";
    finishTool(env);
  };

  const commit = (): void => {
    const b = end();
    const a = start;
    reset();
    if (a === undefined || b === undefined || Math.hypot(b.x - a.x, b.y - a.y) < 1) return;
    env.session.execute(
      addGuideCommand(env.session.ui.getState().activeFloorId, pointMode ? "point" : "line", a, b).command,
    );
  };

  env.setHint(
    "Click a start point, then an end point, or type a distance. Hold Alt for a guide point instead of a line.",
  );
  return {
    isActive: () => start !== undefined,
    pointer: (event) => {
      const floor = floorOf(env);
      if (floor === undefined || event.plan === null) return;
      screen = event.screen;
      pointMode = event.altKey;
      const point = inferFloorPoint(env, event.plan, start === undefined ? {} : { from: start });
      if (event.phase === "down" && event.button === 0) {
        if (start === undefined) {
          start = point;
          pointer = point;
        } else {
          pointer = point;
          commit();
        }
      } else if (event.phase === "move" && start !== undefined) {
        pointer = point;
        preview();
      }
    },
    key: (event) => {
      if (start === undefined) return false;
      const action = feedValueKey(input, event.key);
      if (action === "cancel") reset();
      else if (action === "commit") commit();
      else if (action === "consumed") preview();
      return action !== "none";
    },
    cancel: reset,
  };
};
