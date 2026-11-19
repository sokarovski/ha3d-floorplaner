// Circle in Area Editor: click the center, then the radius (pointer or typed length).
import { createId } from "@shared/domain/ids";
import type { Vec2 } from "@shared/geometry/vector";
import { toAreaLocal, toFloor } from "./planGeometry";

import { commitNewShape } from "./shapeCommit";
import { finishTool, floorOf, focusArea, unitOf } from "./toolContext";
import { inferFloorPoint } from "../inference/toolInference";
import type { ToolFactory } from "./toolTypes";
import { createValueInput, feedValueKey, readoutOf, valueOf } from "./valueInput";

export const createCircleTool = (): ToolFactory => (env) => {
  let center: Vec2 | undefined;
  let radius = 0;
  let screen = { x: 0, y: 0 };
  const input = createValueInput("length");

  const preview = (): void => {
    const area = focusArea(env);
    const c = center;
    if (area === undefined || c === undefined) return;
    const r = valueOf(input, radius, unitOf(env));
    const points = Array.from({ length: 48 }, (_unused, index) => {
      const angle = (index / 48) * Math.PI * 2;
      return toFloor(area, { x: c.x + Math.cos(angle) * r, y: c.y + Math.sin(angle) * r });
    });
    env.setOverlay([{ kind: "polygon", points, fillOpacity: 0.15, outline: true, tone: "accent" }]);
    env.setReadout({ text: `r ${readoutOf(input, radius, unitOf(env))}`, screen });
  };

  const reset = (): void => {
    center = undefined;
    radius = 0;
    input.typed = "";
    finishTool(env);
  };

  const commit = (): void => {
    const area = focusArea(env);
    if (area === undefined || center === undefined) return;
    const r = valueOf(input, radius, unitOf(env));
    const position = center;
    reset();
    if (r < 1) return;
    const id = createId("s");
    commitNewShape(env, area, { id, type: "circle", positionMm: position, radiusMm: r });
  };

  env.setHint("Click the center, then the radius. Type a radius and press Enter.");
  return {
    isActive: () => center !== undefined,
    pointer: (event) => {
      const area = focusArea(env);
      const floor = floorOf(env);
      if (area === undefined || floor === undefined || event.plan === null) return;
      screen = event.screen;
      const local = toAreaLocal(
        area,
        inferFloorPoint(env, event.plan, center === undefined ? {} : { from: toFloor(area, center) }),
      );
      if (event.phase === "down" && event.button === 0) {
        if (center === undefined) center = local;
        else commit();
      } else if (event.phase === "move" && center !== undefined) {
        radius = Math.hypot(local.x - center.x, local.y - center.y);
        preview();
      }
    },
    key: (event) => {
      if (center === undefined) return false;
      const action = feedValueKey(input, event.key);
      if (action === "cancel") reset();
      else if (action === "commit") commit();
      else if (action === "consumed") preview();
      return action !== "none";
    },
    cancel: reset,
  };
};
