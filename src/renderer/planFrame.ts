// The renderer boundary between plan millimetres and Three.js metres (D03):
// plan (x, y, h) mm → world (x/1000, h/1000, −y/1000) m. Scene content is authored inside one "plan root"
// group whose transform performs exactly this mapping (rotation −90° about X, scale 1/1000), so geometry
// buffers from the geometry core are used in mm without per-vertex conversion. The mapping is a proper
// rotation, so triangle winding (CCW seen from the outward normal) is preserved.
import { Group, Vector3 } from "three";
import type { PlanPoint3 } from "./runtimeTypes";

export const mmPerMetre = 1000;

export const createPlanRoot = (): Group => {
  const root = new Group();
  root.name = "planRoot";
  root.rotation.x = -Math.PI / 2;
  root.scale.setScalar(1 / mmPerMetre);
  return root;
};

export const planToWorld = (point: PlanPoint3, target: Vector3 = new Vector3()): Vector3 =>
  target.set(point.x / mmPerMetre, point.h / mmPerMetre, -point.y / mmPerMetre);

export const worldToPlan = (world: Vector3): PlanPoint3 => ({
  x: world.x * mmPerMetre,
  y: -world.z * mmPerMetre,
  h: world.y * mmPerMetre,
});
