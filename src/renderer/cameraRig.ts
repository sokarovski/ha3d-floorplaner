// Editor cameras (spec/builder/screens/floor-builder.md#camera-controls-and-view-choices, D16).
// Top: orthographic, straight down, plan +y = screen up, pan/zoom only.
// 3D: perspective with target/radius/azimuth/polar state; orbiting rotates the view about a fixed pivot
// (the framed floor's center) so panning never moves the orbit center. Zoom is clamped relative to the
// floor extent and only changes on explicit gestures or frame().
import type { Raycaster } from "three";
import { MathUtils, OrthographicCamera, PerspectiveCamera, Vector2, Vector3 } from "three";
import type { FloorBounds } from "./floorScene";
import { mmPerMetre, planToWorld } from "./planFrame";
import type { CameraSnapshot, ScreenPoint, ViewMode } from "./runtimeTypes";

export type CameraRig = Readonly<{
  cameras: readonly [OrthographicCamera, PerspectiveCamera];
  camera: () => OrthographicCamera | PerspectiveCamera;
  mode: () => ViewMode;
  setMode: (mode: ViewMode) => void;
  setSize: (widthPx: number, heightPx: number) => void;
  size: () => Readonly<{ width: number; height: number }>;
  setExtent: (bounds: FloorBounds | null) => void;
  frame: (bounds: FloorBounds, setPivot: boolean) => void;
  /** Moves the view so the content follows a pointer drag of (dx, dy) CSS pixels. */
  panPixels: (dx: number, dy: number) => void;
  /** Orbits about the pivot for a drag of (dx, dy) CSS pixels (3D only). */
  orbitPixels: (dx: number, dy: number) => void;
  /**
   * Wall face view (Phase 5.1): look straight at a vertical face (3D, horizontal view; a roof face's sloped plane in
   * Phase 19.3), framing it, with
   * orbiting locked and everything nearer than `clipAheadM` in front of the face clipped away (so the room's
   * opposite wall does not hide it). Null restores the previous 3D view.
   */
  setFaceView: (
    face: Readonly<{
      center: Vector3;
      normal: Vector3;
      widthM: number;
      heightM: number;
      clipAheadM: number;
    }> | null,
  ) => void;
  /**
   * 3D top view (owner, Phase 5 follow-up): straight down with the plan's axes reset (X right, Y up, as in
   * Top), but in perspective. The caller fits afterwards.
   */
  lookStraightDown: () => void;
  /** 3D: orbit a quarter turn about the pivot, keeping elevation and distance. */
  turnQuarter: () => void;
  /** True while a face view locks orbiting. */
  orbitLocked: () => boolean;
  /** 3D: orbit about this world point from now on (the point grabbed by an Orbit drag); the view stays put. */
  setPivot: (world: Vector3) => void;
  /** 3D: orbit about the pivot to an azimuth (radians), keeping the elevation and distance. */
  orbitToAzimuth: (azimuth: number) => void;
  /** factor > 1 zooms in, keeping the point under the screen position fixed. */
  zoomAt: (factor: number, screen: ScreenPoint) => void;
  setRay: (raycaster: Raycaster, screen: ScreenPoint) => void;
  mmPerPixel: () => number;
  snapshot: () => CameraSnapshot;
}>;

const fovDeg = 45;
const orbitRadiansPerPixel = 0.0075;
const minPolar = 0.02;
const maxPolar = 1.53;
const defaultAzimuth = 0.55;
const defaultPolar = 0.95;
/** Top → 3D keeps the view center and scales distance so the oblique view still shows the Top extent. */
const obliqueMargin = 1.4;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export const createCameraRig = (): CameraRig => {
  const ortho = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  ortho.up.set(0, 0, -1);
  const perspective = new PerspectiveCamera(fovDeg, 1, 0.05, 5000);

  let mode: ViewMode = "top";
  let width = 1;
  let height = 1;
  // Top state (world metres).
  const topCenter = new Vector2();
  let halfHeight = 10;
  // 3D state.
  const target = new Vector3();
  const pivot = new Vector3();
  let radius = 25;
  let azimuth = defaultAzimuth;
  let polar = defaultPolar;
  // Face view: the camera looks horizontally at a wall face; near clips just in front of it.
  /** Face view: how far in front of the face the near plane sits (it follows zooming). */
  let faceClipAheadM: number | null = null;
  let savedView: { target: Vector3; radius: number; azimuth: number; polar: number; pivot: Vector3 } | null =
    null;
  // Clamps from the floor extent.
  let extentM = 20;
  let topHeightM = 10;

  const aspect = (): number => width / Math.max(height, 1);
  const tanHalfFov = Math.tan(MathUtils.degToRad(fovDeg / 2));
  const halfHeightRange = (): [number, number] => [0.15, extentM * 3 + 20];
  const radiusRange = (): [number, number] => [0.25, extentM * 6 + 40];

  const offset = (): Vector3 =>
    new Vector3(
      Math.sin(polar) * Math.sin(azimuth),
      Math.cos(polar),
      Math.sin(polar) * Math.cos(azimuth),
    ).multiplyScalar(radius);

  const update = (): void => {
    const a = aspect();
    ortho.left = -halfHeight * a;
    ortho.right = halfHeight * a;
    ortho.top = halfHeight;
    ortho.bottom = -halfHeight;
    const elevation = topHeightM + 50;
    ortho.position.set(topCenter.x, elevation, topCenter.y);
    ortho.near = 0.1;
    ortho.far = elevation + 50;
    ortho.lookAt(topCenter.x, 0, topCenter.y);
    ortho.updateProjectionMatrix();
    ortho.updateMatrixWorld();

    perspective.aspect = a;
    perspective.position.copy(target).add(offset());
    perspective.near =
      faceClipAheadM === null ? clamp(radius * 0.004, 0.01, 1) : Math.max(0.05, radius - faceClipAheadM);
    perspective.far = radius * 20 + extentM * 4 + 100;
    perspective.up.set(0, 1, 0);
    perspective.lookAt(target);
    perspective.updateProjectionMatrix();
    perspective.updateMatrixWorld();
  };

  const mmPerPixel = (): number =>
    ((mode === "top" ? 2 * halfHeight : 2 * radius * tanHalfFov) / Math.max(height, 1)) * mmPerMetre;

  const ndc = (screen: ScreenPoint): Vector2 =>
    new Vector2((screen.x / Math.max(width, 1)) * 2 - 1, -(screen.y / Math.max(height, 1)) * 2 + 1);

  const camera = (): OrthographicCamera | PerspectiveCamera => (mode === "top" ? ortho : perspective);

  update();

  return {
    cameras: [ortho, perspective],
    camera,
    mode: () => mode,
    setMode: (next) => {
      if (next === mode) return;
      if (next === "top") {
        topCenter.set(target.x, target.z);
        halfHeight = clamp((radius * tanHalfFov) / obliqueMargin, ...halfHeightRange());
      } else {
        target.set(topCenter.x, target.y, topCenter.y);
        radius = clamp((halfHeight / tanHalfFov) * obliqueMargin, ...radiusRange());
      }
      mode = next;
      update();
    },
    setSize: (nextWidth, nextHeight) => {
      width = Math.max(nextWidth, 1);
      height = Math.max(nextHeight, 1);
      update();
    },
    size: () => ({ width, height }),
    setExtent: (bounds) => {
      if (bounds === null) {
        extentM = 20;
        topHeightM = 10;
      } else {
        extentM = Math.max(Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / mmPerMetre, 2);
        topHeightM = bounds.maxHeightMm / mmPerMetre + 5;
      }
      update();
    },
    frame: (bounds, setPivot) => {
      const center = planToWorld({
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2,
        h: 0,
      });
      const widthM = (bounds.maxX - bounds.minX) / mmPerMetre;
      const depthM = (bounds.maxY - bounds.minY) / mmPerMetre;
      const heightM = bounds.maxHeightMm / mmPerMetre;
      topCenter.set(center.x, center.z);
      halfHeight = clamp(Math.max(depthM / 2, widthM / 2 / aspect()) * 1.12 + 0.3, ...halfHeightRange());
      const sphere = Math.max(0.5 * Math.hypot(widthM, depthM, heightM), 0.5);
      const verticalHalf = MathUtils.degToRad(fovDeg / 2);
      const horizontalHalf = Math.atan(Math.tan(verticalHalf) * aspect());
      target.set(center.x, heightM * 0.3, center.z);
      radius = clamp((sphere / Math.sin(Math.min(verticalHalf, horizontalHalf))) * 1.02, ...radiusRange());
      if (setPivot) pivot.copy(target);
      update();
    },
    panPixels: (dx, dy) => {
      const step = mmPerPixel() / mmPerMetre;
      if (mode === "top") {
        topCenter.x -= dx * step;
        topCenter.y -= dy * step;
      } else {
        const right = new Vector3().setFromMatrixColumn(perspective.matrixWorld, 0);
        const up = new Vector3().setFromMatrixColumn(perspective.matrixWorld, 1);
        target.addScaledVector(right, -dx * step).addScaledVector(up, dy * step);
      }
      update();
    },
    setFaceView: (face) => {
      if (face === null) {
        if (savedView !== null) {
          target.copy(savedView.target);
          radius = savedView.radius;
          azimuth = savedView.azimuth;
          polar = savedView.polar;
          pivot.copy(savedView.pivot);
        }
        savedView = null;
        faceClipAheadM = null;
        update();
        return;
      }
      savedView ??= { target: target.clone(), radius, azimuth, polar, pivot: pivot.clone() };
      mode = "3d";
      // Offset (sin p·sin a, cos p, sin p·cos a) along the face normal: a = atan2(nx, nz), p = acos(ny) (π/2 for
      // a wall; a roof face's slope, Phase 19.3; a flat face stops just short of straight down).
      azimuth = Math.atan2(face.normal.x, face.normal.z);
      polar = clamp(Math.acos(clamp(face.normal.y, -1, 1)), minPolar, Math.PI / 2);
      target.copy(face.center);
      pivot.copy(face.center);
      const verticalHalf = MathUtils.degToRad(fovDeg / 2);
      const fitHeight = face.heightM / 2 / Math.tan(verticalHalf);
      const fitWidth = face.widthM / 2 / (Math.tan(verticalHalf) * aspect());
      radius = Math.max(fitHeight, fitWidth) * 1.25 + 0.2;
      faceClipAheadM = face.clipAheadM;
      update();
    },
    orbitLocked: () => faceClipAheadM !== null,
    lookStraightDown: () => {
      if (mode === "top" || faceClipAheadM !== null) return;
      // Azimuth 0 puts the camera south of the target looking north: plan X to the right, Y up the screen.
      azimuth = 0;
      polar = minPolar;
      target.copy(pivot);
      update();
    },
    turnQuarter: () => {
      if (mode === "top" || faceClipAheadM !== null) return;
      const fromPivot = target.clone().sub(pivot);
      fromPivot.applyAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
      azimuth += Math.PI / 2;
      target.copy(pivot).add(fromPivot);
      update();
    },
    orbitPixels: (dx, dy) => {
      if (mode === "top" || faceClipAheadM !== null) return;
      const yaw = -dx * orbitRadiansPerPixel;
      const pitch = clamp(polar - dy * orbitRadiansPerPixel, minPolar, maxPolar) - polar;
      const fromPivot = target.clone().sub(pivot);
      fromPivot.applyAxisAngle(new Vector3(0, 1, 0), yaw);
      azimuth += yaw;
      const right = new Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth));
      fromPivot.applyAxisAngle(right, pitch);
      polar += pitch;
      target.copy(pivot).add(fromPivot);
      update();
    },
    setPivot: (world) => {
      if (mode === "top") return;
      pivot.copy(world);
    },
    orbitToAzimuth: (next) => {
      if (mode === "top" || faceClipAheadM !== null) return;
      const turn = 2 * Math.PI;
      const yaw = ((((next - azimuth + Math.PI) % turn) + turn) % turn) - Math.PI;
      const fromPivot = target.clone().sub(pivot);
      fromPivot.applyAxisAngle(new Vector3(0, 1, 0), yaw);
      azimuth += yaw;
      target.copy(pivot).add(fromPivot);
      update();
    },
    zoomAt: (factor, screen) => {
      if (!(factor > 0)) return;
      if (mode === "top") {
        const step = mmPerPixel() / mmPerMetre;
        const worldX = topCenter.x + (screen.x - width / 2) * step;
        const worldZ = topCenter.y + (screen.y - height / 2) * step;
        halfHeight = clamp(halfHeight / factor, ...halfHeightRange());
        const nextStep = (2 * halfHeight) / height;
        topCenter.set(
          worldX - (screen.x - width / 2) * nextStep,
          worldZ - (screen.y - height / 2) * nextStep,
        );
      } else {
        const nextRadius = clamp(radius / factor, ...radiusRange());
        const scale = nextRadius / radius;
        const origin = perspective.position.clone();
        const direction = new Vector3(ndc(screen).x, ndc(screen).y, 0.5)
          .unproject(perspective)
          .sub(origin)
          .normalize();
        const planeDistance =
          direction.y < -1e-4 ? (target.y - origin.y) / direction.y : Number.POSITIVE_INFINITY;
        const distance = planeDistance > 0 && planeDistance < radius * 10 ? planeDistance : radius;
        const anchor = origin.clone().addScaledVector(direction, distance);
        target.sub(anchor).multiplyScalar(scale).add(anchor);
        radius = nextRadius;
      }
      update();
    },
    setRay: (raycaster, screen) => {
      raycaster.setFromCamera(ndc(screen), camera());
    },
    mmPerPixel,
    snapshot: () => {
      const active = camera();
      const look = mode === "top" ? new Vector3(topCenter.x, 0, topCenter.y) : target.clone();
      return {
        mode,
        position: { x: active.position.x, y: active.position.y, z: active.position.z },
        target: { x: look.x, y: look.y, z: look.z },
        up: { x: active.up.x, y: active.up.y, z: active.up.z },
        fovDeg: mode === "3d" ? fovDeg : null,
        orthoHeightM: mode === "top" ? halfHeight * 2 : null,
        aspect: aspect(),
      };
    },
  };
};
