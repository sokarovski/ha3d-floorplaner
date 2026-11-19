// Corner edit (Area Editor): grab one corner and move only it, so a room can become an irregular polygon.
// Corners snap to other corners, then edges and inference lines. A rectangle becomes an equivalent polygon
// in the same edit (walls stay on their edges); circles have no corners. Self-intersections are rejected.
import { editShapeCornerCommand } from "@shared/domain/commands/shapeCommands";
import type { ShapeValue } from "@shared/domain/schemas/shapes";
import type { Vec2 } from "@shared/geometry/vector";
import type { ScreenPoint } from "../../../renderer/runtimeTypes";
import { inferenceSceneOf } from "../inference/inferenceScene";
import { inferenceCapturePx, inferPoint } from "../inference/inferPoint";
import { toAreaLocal } from "./planGeometry";
import { shapeCorners, shapeRingInFloor } from "./shapeNudge";
import { distance } from "./snapping";
import { shapeSetIdOf, finishTool, floorOf, focusArea, magnetic, snapFloor, unitOf } from "./toolContext";
import type { ToolFactory } from "./toolTypes";
import { readoutOf } from "./valueInput";
import { createValueInput } from "./valueInput";

type Corner = Readonly<{ shape: ShapeValue; index: number; point: Vec2 }>;

export const createCornerEditTool = (): ToolFactory => (env) => {
  let drag: { corner: Corner; to: Vec2 } | undefined;
  const input = createValueInput("length");

  const cornerAt = (point: Vec2): Corner | undefined => {
    const area = focusArea(env);
    if (area === undefined) return undefined;
    const radius = inferenceCapturePx * env.runtime.worldUnitsPerPixel();
    let best: Corner | undefined;
    for (const shape of area.floor.shapes)
      shapeCorners(area, shape).forEach((corner, index) => {
        if (
          distance(corner, point) <= radius &&
          (best === undefined || distance(corner, point) < distance(best.point, point))
        )
          best = { shape, index, point: corner };
      });
    return best;
  };

  const preview = (corner: Corner, to: Vec2, screen: ScreenPoint): void => {
    const area = focusArea(env);
    if (area === undefined) return;
    const ring = shapeRingInFloor(area, corner.shape).map((point, index) =>
      index === corner.index ? to : point,
    );
    env.setOverlay([
      { kind: "polygon", points: ring, fillOpacity: 0.15, outline: true, tone: "accent" },
      { kind: "point", at: to, marker: "dot", sizePx: 10, tone: "accent" },
    ]);
    env.setReadout({ text: readoutOf(input, distance(corner.point, to), unitOf(env)), screen });
  };

  const commit = (): void => {
    const area = focusArea(env);
    const current = drag;
    drag = undefined;
    finishTool(env);
    if (area === undefined || current === undefined || distance(current.corner.point, current.to) < 0.5)
      return;
    env.session.execute(
      editShapeCornerCommand(
        env.session.ui.getState().activeFloorId,
        area.id,
        current.corner.shape.id,
        current.corner.index,
        toAreaLocal(area, current.to),
        shapeSetIdOf(env),
      ),
    );
  };

  env.setHint(
    "Drag a corner of a shape to move only that corner. Rectangles become polygons; circles have no corners.",
  );
  return {
    isActive: () => drag !== undefined,
    target: (event) => (event.plan === null ? undefined : cornerAt(event.plan)?.shape.id),
    pointer: (event) => {
      if (event.plan === null) return;
      if (drag !== undefined) {
        if (event.phase === "move") {
          const floor = floorOf(env);
          const inferred =
            floor === undefined || !magnetic(env)
              ? undefined
              : inferPoint(
                  inferenceSceneOf(snapFloor(env, floor)),
                  event.plan,
                  env.runtime.worldUnitsPerPixel(),
                  {
                    from: drag.corner.point,
                  },
                );
          env.setCue(inferred?.cue);
          drag.to = inferred?.point ?? event.plan;
          preview(drag.corner, drag.to, event.screen);
        } else if (event.phase === "down" && event.button === 0) commit();
        return;
      }
      const corner = cornerAt(event.plan);
      if (event.phase === "move") {
        env.setOverlay(
          corner === undefined
            ? []
            : [{ kind: "point", at: corner.point, marker: "dot", sizePx: 12, tone: "accent" }],
        );
        env.setCursor(corner === undefined ? "default" : "move");
      } else if (event.phase === "down" && event.button === 0 && corner !== undefined) {
        env.session.ui.setState({ selection: [corner.shape.id] });
        drag = { corner, to: corner.point };
        preview(corner, corner.point, event.screen);
      }
    },
    key: (event) => {
      if (drag === undefined) return false;
      if (event.key === "Escape") {
        drag = undefined;
        finishTool(env);
        return true;
      }
      if (event.key === "Enter") {
        commit();
        return true;
      }
      return false;
    },
    cancel: () => {
      drag = undefined;
      finishTool(env);
    },
  };
};
