// The viewer's orbit camera (Phase 14.6, spec/home-assistant/viewer-mvp.md#houseviewer): the orbit target, distance
// and angles that place the perspective camera, and the builder's camera operations on them (pan, orbit, zoom at
// the pointer; the same rates as src/renderer/cameraRig.ts), so `attachNavigationInput` drives it with the builder's
// gesture map. The viewer orbits about its target (the point at the screen's framing centre), within its orbit and
// zoom limits, and the target stays near the house. Spring moves (houseViewer.ts) write the same state.
import { Vector2, Vector3 } from "three";
import type { PerspectiveCamera } from "three";
import type { NavigationTarget } from "../../src/renderer/navigationInput";
import type { ScreenPoint, ViewMode } from "../../src/renderer/runtimeTypes";

/** Radians of orbit per CSS pixel of drag or scroll: the builder's rate (cameraRig.ts). */
const orbitRadiansPerPixel = 0.0075;

/** The orbit limits of gestures: the polar angle (from straight up) and the distance to the target (m). */
export type OrbitLimits = {
  minPolar: number;
  maxPolar: number;
  minDistance: number;
  maxDistance: number;
};

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export class ViewerOrbit implements NavigationTarget {
  readonly target = new Vector3();
  distance = 10;
  azimuth = 0;
  polar = Math.PI / 4;
  readonly limits: OrbitLimits;
  /** Where panning may take the target: within `reachM` of `centre` horizontally, and between `floorM` and `ceilingM`. */
  readonly centre = new Vector3();
  reachM = 10;
  floorM = -2;
  ceilingM = 8;
  private width = 1;
  private height = 1;

  constructor(
    private readonly camera: PerspectiveCamera,
    limits: OrbitLimits,
    /** After every camera change: near/far planes and a frame. */
    private readonly onChange: () => void,
  ) {
    this.limits = { ...limits };
  }

  setSize(width: number, height: number): void {
    this.width = Math.max(width, 1);
    this.height = Math.max(height, 1);
  }

  /** Places the camera from the state (offset (sin p·sin a, cos p, sin p·cos a), as OrbitControls and the builder). */
  apply(): void {
    const { target, distance, azimuth, polar } = this;
    this.camera.position.set(
      target.x + distance * Math.sin(polar) * Math.sin(azimuth),
      target.y + distance * Math.cos(polar),
      target.z + distance * Math.sin(polar) * Math.cos(azimuth),
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
  }

  /** The polar range a gesture may move in: the limits, widened to include where a view preset put it (Top view). */
  private polarRange(): readonly [number, number] {
    return [Math.min(this.limits.minPolar, this.polar), Math.max(this.limits.maxPolar, this.polar)];
  }

  private keepTargetNear(): void {
    const dx = this.target.x - this.centre.x;
    const dz = this.target.z - this.centre.z;
    const away = Math.hypot(dx, dz);
    if (away > this.reachM) {
      this.target.x = this.centre.x + (dx / away) * this.reachM;
      this.target.z = this.centre.z + (dz / away) * this.reachM;
    }
    this.target.y = clamp(this.target.y, this.floorM, this.ceilingM);
  }

  private changed(): void {
    this.apply();
    this.onChange();
  }

  // ---- NavigationTarget (src/renderer/navigationInput.ts) ----------------------------------------------

  size(): Readonly<{ width: number; height: number }> {
    return { width: this.width, height: this.height };
  }

  mode(): ViewMode {
    return "3d";
  }

  orbitLocked(): boolean {
    return false;
  }

  /** Moves the view so the house follows a drag of (dx, dy) CSS pixels (at the target's depth, as the builder). */
  panPixels(dx: number, dy: number): void {
    const fov = (this.camera.fov * Math.PI) / 180;
    const step = (2 * this.distance * Math.tan(fov / 2)) / this.height;
    const right = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    this.target.addScaledVector(right, -dx * step).addScaledVector(up, dy * step);
    this.keepTargetNear();
    this.changed();
  }

  /** Orbits about the target for a drag of (dx, dy) CSS pixels, within the polar limits. */
  orbitPixels(dx: number, dy: number): void {
    const [low, high] = this.polarRange();
    this.azimuth -= dx * orbitRadiansPerPixel;
    this.polar = clamp(this.polar - dy * orbitRadiansPerPixel, low, high);
    this.changed();
  }

  /**
   * factor > 1 zooms in toward the point under the screen position (the builder's anchor: where the pointer's ray
   * meets the target's height, else a point at the target's distance), within the distance limits.
   */
  zoomAt(factor: number, screen: ScreenPoint): void {
    if (!(factor > 0)) return;
    const next = clamp(this.distance / factor, this.limits.minDistance, this.limits.maxDistance);
    const scale = next / this.distance;
    if (Math.abs(scale - 1) < 1e-6) return;
    this.camera.updateMatrixWorld();
    const origin = this.camera.position.clone();
    const ndc = new Vector2((screen.x / this.width) * 2 - 1, -(screen.y / this.height) * 2 + 1);
    // The projection carries the view offset (insets, the downward shift), so the ray goes through the pointer.
    const direction = new Vector3(ndc.x, ndc.y, 0.5).unproject(this.camera).sub(origin).normalize();
    const planeDistance =
      direction.y < -1e-4 ? (this.target.y - origin.y) / direction.y : Number.POSITIVE_INFINITY;
    const along = planeDistance > 0 && planeDistance < this.distance * 10 ? planeDistance : this.distance;
    const anchor = origin.addScaledVector(direction, along);
    this.target.sub(anchor).multiplyScalar(scale).add(anchor);
    this.distance = next;
    this.keepTargetNear();
    this.changed();
  }
}
