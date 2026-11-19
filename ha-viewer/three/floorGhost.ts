// The departing view of a floor switch (Phase 16.3 as revised by 16.13, owner: like riding an elevator outside the
// house; spec/home-assistant/viewer-mvp.md#floor-switch-transition). When a switch starts, everything the departing
// view draws (its meshes and its own lights, the sun included) is copied into a separate scene, sharing the geometry
// and materials, before the viewer's layers rebuild for the destination. The copy is placed at its real position
// relative to the destination (the floors' placements), so the house stays stacked as it is while the camera rides
// vertically past it. Each frame of the ride draws the copy with the same camera into its own target and blends it
// over the destination's frame with weight 1 − progress (the ride's own eased progress, from the same animation step):
// the departing view fades out and the destination fades in exactly with the ride, every material alike (a blend of
// two whole renders, so shared or cached materials are never touched), ending at exactly 0 and 1. No image.
//
// Lights: the copy is lit only by its own lights (copies of the departing lamps and sun, with their own shadow maps,
// drawn once on the first frame), and the destination only by its lights, so neither lights or shadows the other.
// Its shaders compile in the background with the destination, so the ride compiles nothing; no shadow map is
// redrawn during the ride.
//
// Ownership: geometry and materials stay owned by the layers that made them. A layer may dispose one while the copy
// still draws it (the destination's sync); the copy then keeps drawing it (Three.js uploads it again, which the
// background compile and first frame do before the ride) and disposes it once more when it is released, so nothing
// it brought back stays on the GPU. The host defers its material sweep while the copy lives.
import {
  ConstantAlphaFactor,
  CustomBlending,
  DirectionalLight,
  HalfFloatType,
  Light,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OneMinusConstantAlphaFactor,
  OrthographicCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  SpotLight,
  UnsignedByteType,
  Vector3,
  WebGLRenderTarget,
} from "three";
import type { BufferGeometry, Material, Matrix4, PerspectiveCamera, Quaternion, WebGLRenderer } from "three";
import type { PlanPoint3 } from "../../src/renderer/runtimeTypes";
import { isMesh } from "../../src/renderer/sceneObjects";

/** The camera the departing view was drawn with, moved with the copy (world metres). */
export type GhostPose = Readonly<{ position: Vector3; quaternion: Quaternion; projection: Matrix4 }>;

export type FloorGhost = Readonly<{
  /** The copy's own scene (its meshes and lights). */
  scene: Scene;
  /**
   * Places the copy for the destination now shown: `planRoot` is the destination's plan root (already placed) and
   * `origin` its frame's origin in the house (mm; the floor's placement, or the house's zero for the whole house).
   */
  place: (planRoot: Object3D, origin: PlanPoint3) => void;
  /** How far the copy moved since it was captured (world m): the departing camera moves with it. */
  shift: () => Vector3;
  /** The departing camera moved with the copy: where the ride starts. */
  startPose: () => GhostPose;
  /** Compiles the copy's shaders (for its target) and the blend's in the background. */
  compile: (renderer: WebGLRenderer, camera: PerspectiveCamera) => Promise<unknown>;
  /**
   * Draws the copy with `camera` into its target and blends it over the frame just drawn:
   * out = copy × (1 − progress) + frame × progress.
   */
  draw: (renderer: WebGLRenderer, camera: PerspectiveCamera, progress: number) => void;
  /** The blend's weight of the destination now (the last `draw`'s progress, clamped to 0..1). */
  weight: () => number;
  /** Releases the copy, its lights and shadow maps, its target, and whatever it brought back on the GPU. */
  dispose: () => void;
}>;

export type GhostSource = Readonly<{
  planRoot: Object3D;
  sunRoot: Object3D;
  /** The departing frame's origin in the house (mm). */
  origin: PlanPoint3;
  camera: PerspectiveCamera;
  scene: Scene;
  /** Drawing-buffer size (px) of the target. */
  width: number;
  height: number;
  /** Multisampling of the target (the canvas's antialiasing). */
  samples: number;
  /** Half-float colour targets are renderable (EXT_color_buffer_float/half_float); else 8-bit. */
  halfFloat: boolean;
}>;

type Owned = Readonly<{ geometries: Set<BufferGeometry>; materials: Set<Material> }>;

/** Copies what `source` draws: shown meshes on the default layer, lights, and the nodes that hold them. */
const copyDrawn = (
  source: Object3D,
  copies: Map<Object3D, Object3D>,
  lights: [Light, Light][],
  owned: Owned,
): Object3D | null => {
  if (!source.visible) return null;
  let copy: Object3D;
  if (source instanceof Light) {
    const light = source.clone(false);
    lights.push([source, light]);
    copy = light;
  } else if (isMesh(source)) {
    if (!source.layers.isEnabled(0)) return null;
    const mesh = source.clone(false);
    owned.geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      owned.materials.add(material);
    copy = mesh;
  } else {
    const node = new Object3D();
    node.name = source.name;
    node.position.copy(source.position);
    node.quaternion.copy(source.quaternion);
    node.scale.copy(source.scale);
    node.matrixAutoUpdate = source.matrixAutoUpdate;
    if (!source.matrixAutoUpdate) node.matrix.copy(source.matrix);
    copy = node;
  }
  copies.set(source, copy);
  for (const child of source.children) {
    const childCopy = copyDrawn(child, copies, lights, owned);
    if (childCopy !== null) copy.add(childCopy);
  }
  return copy;
};

/** A spot or sun light's copy aims at the copy of its target (or a new target where the source's was). */
const aimCopy = (source: Light, light: Light, copies: Map<Object3D, Object3D>): void => {
  const aim = (target: Object3D): Object3D => {
    const mapped = copies.get(target);
    if (mapped !== undefined) return mapped;
    const fresh = new Object3D();
    const holder = light.parent ?? light;
    const sourceHolder = source.parent ?? source;
    fresh.position.copy(sourceHolder.worldToLocal(target.getWorldPosition(new Vector3())));
    holder.add(fresh);
    return fresh;
  };
  if (source instanceof SpotLight && light instanceof SpotLight) light.target = aim(source.target);
  if (source instanceof DirectionalLight && light instanceof DirectionalLight)
    light.target = aim(source.target);
};

export const captureFloorGhost = (source: GhostSource): FloorGhost => {
  const scene = new Scene();
  scene.environment = source.scene.environment;
  scene.environmentIntensity = source.scene.environmentIntensity;
  const copies = new Map<Object3D, Object3D>();
  const lights: [Light, Light][] = [];
  const owned: Owned = { geometries: new Set(), materials: new Set() };
  source.planRoot.updateMatrixWorld(true);
  source.sunRoot.updateMatrixWorld(true);
  const plan = new Object3D();
  plan.position.copy(source.planRoot.position);
  plan.quaternion.copy(source.planRoot.quaternion);
  plan.scale.copy(source.planRoot.scale);
  for (const child of source.planRoot.children) {
    const copy = copyDrawn(child, copies, lights, owned);
    if (copy !== null) plan.add(copy);
  }
  const sun = copyDrawn(source.sunRoot, copies, lights, owned) ?? new Object3D();
  scene.add(plan, sun);
  for (const [from, light] of lights) {
    aimCopy(from, light, copies);
    // The copies' shadow maps are new: drawn once, on the first frame that draws the copy.
    if (
      light.castShadow &&
      (light instanceof PointLight || light instanceof SpotLight || light instanceof DirectionalLight)
    )
      light.shadow.needsUpdate = true;
  }
  const anchor = source.planRoot.position.clone();
  const sunOffset = source.sunRoot.position.clone().sub(anchor);
  const shift = new Vector3();
  const from = {
    position: source.camera.position.clone(),
    quaternion: source.camera.quaternion.clone(),
    projection: source.camera.projectionMatrix.clone(),
  };

  // What a layer disposes while the copy still draws it: disposed again on release (the copy brought it back).
  const disposedMeanwhile: (() => void)[] = [];
  const unwatch: (() => void)[] = [];
  for (const geometry of owned.geometries) {
    const watch = (): void => {
      disposedMeanwhile.push(() => {
        geometry.dispose();
      });
    };
    geometry.addEventListener("dispose", watch);
    unwatch.push(() => {
      geometry.removeEventListener("dispose", watch);
    });
  }
  for (const material of owned.materials) {
    const watch = (): void => {
      disposedMeanwhile.push(() => {
        material.dispose();
      });
    };
    material.addEventListener("dispose", watch);
    unwatch.push(() => {
      material.removeEventListener("dispose", watch);
    });
  }

  const target = new WebGLRenderTarget(Math.max(1, source.width), Math.max(1, source.height), {
    type: source.halfFloat ? HalfFloatType : UnsignedByteType,
    samples: source.samples,
  });
  // out = copy × (1 − progress) + frame × progress, on premultiplied colours and alpha alike.
  const blend = new MeshBasicMaterial({
    map: target.texture,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: CustomBlending,
    blendSrc: OneMinusConstantAlphaFactor,
    blendDst: ConstantAlphaFactor,
    blendSrcAlpha: OneMinusConstantAlphaFactor,
    blendDstAlpha: ConstantAlphaFactor,
  });
  const quadGeometry = new PlaneGeometry(2, 2);
  const quad = new Mesh(quadGeometry, blend);
  quad.frustumCulled = false;
  const quadScene = new Scene();
  quadScene.add(quad);
  const quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let shadowsDrawn = false;
  let disposed = false;

  return {
    scene,
    place: (planRoot, origin) => {
      planRoot.updateMatrixWorld(true);
      const at = planRoot.localToWorld(
        new Vector3(source.origin.x - origin.x, source.origin.y - origin.y, source.origin.h - origin.h),
      );
      plan.position.copy(at);
      shift.copy(at).sub(anchor);
      sun.position.copy(anchor).add(sunOffset).add(shift);
      scene.updateMatrixWorld(true);
    },
    shift: () => shift.clone(),
    startPose: () => ({
      position: from.position.clone().add(shift),
      quaternion: from.quaternion.clone(),
      projection: from.projection.clone(),
    }),
    compile: (renderer, camera) => {
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      const copy = renderer.compileAsync(scene, camera);
      renderer.setRenderTarget(previous);
      return Promise.all([copy, renderer.compileAsync(quadScene, quadCamera)]);
    },
    draw: (renderer, camera, progress) => {
      if (disposed) return;
      const previous = renderer.getRenderTarget();
      // The destination's frame drew its own shadow maps; the copies' are drawn once, on the first frame.
      if (!shadowsDrawn) {
        shadowsDrawn = true;
        renderer.shadowMap.needsUpdate = true;
      }
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(previous);
      blend.blendAlpha = Math.min(Math.max(progress, 0), 1);
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(quadScene, quadCamera);
      renderer.autoClear = autoClear;
    },
    weight: () => blend.blendAlpha,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const stop of unwatch) stop();
      for (const release of disposedMeanwhile) release();
      for (const [, light] of lights) light.dispose();
      scene.clear();
      target.dispose();
      blend.dispose();
      quadGeometry.dispose();
    },
  };
};
