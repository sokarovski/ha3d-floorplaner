// The engine as tools use it: infer a floor-frame point (Magnetic on), publish the cue, return the point.
import type { Vec2 } from "@shared/geometry/vector";
import { floorOf, magnetic, snapFloor } from "../tools/toolContext";
import type { ToolEnv } from "../tools/toolTypes";
import { inferenceSceneOf } from "./inferenceScene";
import type { InferPointOptions } from "./inferPoint";
import { inferPoint } from "./inferPoint";

export const inferFloorPoint = (env: ToolEnv, point: Vec2, options: InferPointOptions = {}): Vec2 => {
  const floor = floorOf(env);
  if (floor === undefined || !magnetic(env)) {
    env.setCue(undefined);
    return point;
  }
  const inference = inferPoint(
    inferenceSceneOf(snapFloor(env, floor)),
    point,
    env.runtime.worldUnitsPerPixel(),
    options,
  );
  env.setCue(inference?.cue);
  return inference?.point ?? point;
};
