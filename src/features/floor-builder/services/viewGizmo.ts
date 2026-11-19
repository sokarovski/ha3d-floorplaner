// View gizmo (Phase 4.6): the floor's red (x), green (y), and vertical (z) axes as seen from the camera,
// for the ViewGizmo design-system component. World frame (Three.js): x = plan x, y = up, z = −plan y.
import type { ViewGizmoAxis } from "../../../design-system/components/ViewGizmo/ViewGizmo";
import type { CameraSnapshot } from "../../../renderer/runtimeTypes";

type Vec3 = Readonly<{ x: number; y: number; z: number }>;

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const normalize = (v: Vec3): Vec3 => {
  const length = Math.hypot(v.x, v.y, v.z);
  return length < 1e-9 ? { x: 0, y: 0, z: 0 } : { x: v.x / length, y: v.y / length, z: v.z / length };
};

const worldAxes: readonly Readonly<{ axis: ViewGizmoAxis["axis"]; v: Vec3 }>[] = [
  { axis: "x", v: { x: 1, y: 0, z: 0 } },
  { axis: "y", v: { x: 0, y: 0, z: -1 } },
  { axis: "z", v: { x: 0, y: 1, z: 0 } },
];

/** Camera right, up, and forward (into the screen) in the world frame. */
const basisOf = (camera: CameraSnapshot): Readonly<{ right: Vec3; up: Vec3; forward: Vec3 }> => {
  if (camera.mode === "top")
    return { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: -1 }, forward: { x: 0, y: -1, z: 0 } };
  const forward = normalize({
    x: camera.target.x - camera.position.x,
    y: camera.target.y - camera.position.y,
    z: camera.target.z - camera.position.z,
  });
  const right = normalize(cross(forward, camera.up));
  return { right, up: cross(right, forward), forward };
};

const project = (camera: CameraSnapshot, v: Vec3): Readonly<{ dx: number; dy: number; depth: number }> => {
  const { right, up, forward } = basisOf(camera);
  return { dx: dot(v, right), dy: -dot(v, up), depth: dot(v, forward) };
};

export const gizmoAxes = (camera: CameraSnapshot): readonly ViewGizmoAxis[] =>
  worldAxes.map(({ axis, v }) => {
    const { dx, dy, depth } = project(camera, v);
    return { axis, dx, dy, behind: depth > 0.05 };
  });

/** North (clockwise from plan up, degrees) on screen. */
export const gizmoNorth = (
  camera: CameraSnapshot,
  northRotationDeg: number,
): Readonly<{ dx: number; dy: number }> => {
  const r = (northRotationDeg * Math.PI) / 180;
  const { dx, dy } = project(camera, { x: Math.sin(r), y: 0, z: -Math.cos(r) });
  return { dx, dy };
};
