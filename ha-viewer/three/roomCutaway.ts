// The room cutaway (Phase 8.2a): while a room is open, what stands between the camera and the room gets out of
// the way. The viewer always uses A, the fade (owner 2026-11-17 ended the experiment and removed its setting);
// variant B's code is kept unused for now.
//
// A. "fade" (default): the builder's isolation fades every other room (walls, floors, objects, fixtures) to the
//    "dimmed" level, and the room's own walls on the camera's side to "faded" (src/renderer/surfaceMaterialKey.ts
//    opacities); the near walls follow the camera as it orbits. A neighbour's door or window in a wall the room
//    shares counts as the room's own (Phase 15.7, floorScene.entityFade): clear, its doorway cut through the
//    room's wall layer, and faded with the room's wall there when that wall is near.
// B. "dome": the reverse-dome mask (cutawayFunnel.ts): every mesh material gets a shader test that discards, with a
//    dithered soft edge, whatever lies above the funnel from a ring around the house down to the room's floor
//    centre. The room's own contents inside its plan box are never cut; its walls are.
//
// Picking looks through what the cutaway removed (cut fragments, faded surfaces), so a tap on the room's floor
// behind a faded or cut wall still reaches the room.
import type { Intersection, Material, Mesh, Object3D } from "three";
import {
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  Vector3,
  Vector4,
} from "three";
import type { FloorScene } from "../../src/renderer/floorScene";
import { isMesh } from "../../src/renderer/sceneObjects";
import { setMaterialPatch } from "../../src/renderer/materialPatches";
import type { FadeLevel } from "../../src/renderer/surfaceMaterialKey";
import type { Funnel, FunnelParams } from "./cutawayFunnel";
import { cutAmount, defaultFunnelParams, funnelFor, funnelGlsl } from "./cutawayFunnel";

export type CutawayMode = "fade" | "dome" | "off";

export const cutawayModes: readonly CutawayMode[] = ["fade", "dome", "off"];

export type CutawayContext = Readonly<{
  floorScene: FloorScene;
  /** The plan root (plan mm → world m). */
  planRoot: Object3D;
  /** Re-runs the material pass of the floor scene and the instances; `layersChanged` also redraws shadows. */
  applyMaterials: (layersChanged: boolean) => void;
  invalidate: () => void;
}>;

export type RoomCutaway = Readonly<{
  mode: () => CutawayMode;
  setMode: (mode: CutawayMode) => void;
  /** Applies the cutaway around a room, or (null) restores the whole house. */
  focus: (areaId: string | null) => void;
  /** Every frame before rendering: follows the camera (near walls in A, the ring's reach in B). */
  update: (eye: Vector3) => void;
  /** After every material pass: B patches materials it has not seen yet. */
  afterMaterials: () => void;
  /** True when the hit lies on something the cutaway removed or faded; picking then looks through it. */
  looksThrough: (hit: Intersection) => boolean;
  /** A: the fade of something hosted on a wall (a door or window), so it fades with its near wall. */
  wallFade: (wallId: string | undefined) => FadeLevel;
  /**
   * B's live shader uniforms (for `funnelGlsl`), so overlays drawn over the house (the 8.6 intrusion sweeps) cut
   * exactly what the house's materials cut. Read-only for them; the cutaway alone sets the values.
   */
  cutUniforms: CutUniforms;
}>;

/** The uniforms `funnelGlsl` reads, world metres (see cutawayFunnel.ts). */
export type CutUniforms = Readonly<{
  hpCutOn: { value: number };
  hpCutApex: { value: Vector3 };
  hpCutRing: { value: Vector3 };
  hpCutShape: { value: Vector3 };
  hpCutKeep: { value: Vector4 };
}>;

/** A wall of the room counts as "between" when its centre lies within ±70° of the camera's side (convention). */
const nearCos = Math.cos((70 * Math.PI) / 180);
/** The room's contents box is this much larger than its floor bounds (mm), for fixtures on its walls. */
const keepMarginMm = 50;
/** Picking treats a surface fainter than this as faded away. */
const fadedOpacity = 0.5;

type Role = "wall" | "content";

const patchable = (material: Material): boolean =>
  material instanceof MeshStandardMaterial ||
  material instanceof MeshBasicMaterial ||
  material instanceof MeshLambertMaterial ||
  material instanceof MeshPhongMaterial;

const materialsOf = (mesh: Mesh): readonly Material[] =>
  Array.isArray(mesh.material) ? mesh.material : [mesh.material];

const hitMaterial = (hit: Intersection): Material | null => {
  const object = hit.object;
  if (!isMesh(object)) return null;
  const material: Material | Material[] = object.material;
  if (!Array.isArray(material)) return material;
  return material[hit.face?.materialIndex ?? 0] ?? null;
};

type Focus = Readonly<{
  areaId: string;
  /** The room's floor centre and box, plan mm. */
  center: Readonly<{ x: number; y: number }>;
  bounds: Readonly<{ minX: number; minY: number; maxX: number; maxY: number }>;
}>;

export const createRoomCutaway = (
  context: CutawayContext,
  params: FunnelParams = defaultFunnelParams,
): RoomCutaway => {
  const { floorScene, planRoot } = context;
  let mode: CutawayMode = "fade";
  let focused: Focus | null = null;
  let nearKey = "";
  let near: ReadonlySet<string> = new Set();
  let funnel: Funnel | null = null;
  const patched = new WeakMap<Material, Role>();
  const uniforms: CutUniforms = {
    hpCutOn: { value: 0 },
    hpCutApex: { value: new Vector3() },
    hpCutRing: { value: new Vector3() },
    hpCutShape: { value: new Vector3() },
    hpCutKeep: { value: new Vector4() },
  };

  const toWorld = (x: number, y: number, h: number): Vector3 => {
    planRoot.updateMatrixWorld(true);
    return planRoot.localToWorld(new Vector3(x, y, h));
  };

  const wallMeshes = (): Set<Object3D> => new Set(floorScene.wallLayers().map((layer) => layer.mesh));

  // ---- B: the dome shader ----------------------------------------------------------------------------

  const patch = (material: Material, role: Role): void => {
    if (patched.get(material) === role) return;
    patched.set(material, role);
    // Composed with the other material patches (the strip light, src/renderer/stripShading.ts).
    setMaterialPatch(material, "hpcut", {
      key: () => role,
      apply: (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 hpCutWorld;")
          .replace(
            "#include <project_vertex>",
            "#include <project_vertex>\n  hpCutWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
          );
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", `#include <common>\n${funnelGlsl}`)
          .replace(
            "void main() {",
            `void main() {\n  if (hpCutAway(${role === "content" ? "true" : "false"})) discard;`,
          );
      },
    });
  };

  const patchAll = (): void => {
    const walls = wallMeshes();
    planRoot.traverse((object) => {
      if (!isMesh(object)) return;
      const role: Role = walls.has(object) ? "wall" : "content";
      for (const material of materialsOf(object)) {
        if (!patchable(material)) continue;
        // A material shared by a wall and an object is cut as a wall (floors sit below the funnel anyway).
        if (patched.get(material) === "wall") continue;
        patch(material, role);
      }
    });
  };

  const updateFunnel = (eye: Vector3): void => {
    const room = focused;
    const bounds = floorScene.bounds();
    if (room === null || bounds === null) return;
    const apex = toWorld(room.center.x, room.center.y, 0);
    const houseCenter = toWorld((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2, 0);
    const radius = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2000;
    const top = toWorld(0, 0, bounds.maxHeightMm).y;
    const next = funnelFor(
      {
        roomFloorCenter: { x: apex.x, y: apex.y, z: apex.z },
        houseCenterX: houseCenter.x,
        houseCenterZ: houseCenter.z,
        houseRadius: radius,
        wallTopY: top,
        eye: { x: eye.x, y: eye.y, z: eye.z },
      },
      params,
    );
    funnel = next;
    uniforms.hpCutApex.value.set(next.apex.x, next.apex.y, next.apex.z);
    uniforms.hpCutRing.value.set(next.ringCenterX, next.ringCenterZ, next.ringRadius);
    uniforms.hpCutShape.value.set(next.topY, next.curve, next.softEdge);
  };

  const keepBox = (room: Focus): Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number }> => {
    const a = toWorld(room.bounds.minX - keepMarginMm, room.bounds.minY - keepMarginMm, 0);
    const b = toWorld(room.bounds.maxX + keepMarginMm, room.bounds.maxY + keepMarginMm, 0);
    return {
      minX: Math.min(a.x, b.x),
      minZ: Math.min(a.z, b.z),
      maxX: Math.max(a.x, b.x),
      maxZ: Math.max(a.z, b.z),
    };
  };

  // ---- A: fades ----------------------------------------------------------------------------------------

  /** The room's walls whose bands lie on the camera's side of the room centre. */
  const nearWalls = (room: Focus, eye: Vector3): Set<string> => {
    planRoot.updateMatrixWorld(true);
    const eyePlan = planRoot.worldToLocal(eye.clone());
    const ex = eyePlan.x - room.center.x;
    const ey = eyePlan.y - room.center.y;
    const eyeLength = Math.hypot(ex, ey);
    const near = new Set<string>();
    if (eyeLength < 1) return near;
    for (const layer of floorScene.wallLayers())
      for (const band of layer.walls.bands) {
        if (band.areaId !== room.areaId || band.ring.length === 0) continue;
        const cx = band.ring.reduce((sum, point) => sum + point.x, 0) / band.ring.length - room.center.x;
        const cy = band.ring.reduce((sum, point) => sum + point.y, 0) / band.ring.length - room.center.y;
        const length = Math.hypot(cx, cy);
        if (length > 1 && (cx * ex + cy * ey) / (length * eyeLength) > nearCos) near.add(band.wallId);
      }
    return near;
  };

  const applyNear = (next: ReadonlySet<string>): void => {
    const key = [...next].sort().join(",");
    if (key === nearKey) return;
    nearKey = key;
    near = next;
    floorScene.setWallFade(
      next.size === 0 ? null : (wallId): FadeLevel => (next.has(wallId) ? "faded" : "normal"),
    );
    context.applyMaterials(false);
  };

  // ---- both ---------------------------------------------------------------------------------------------

  const apply = (): void => {
    const room = focused;
    if (room !== null && mode === "fade") {
      floorScene.setIsolation({
        areaId: room.areaId,
        others: "faded",
        fadeOwnContent: false,
        othersLocked: false,
      });
      nearKey = "";
      near = new Set();
      floorScene.setWallFade(null);
      context.applyMaterials(true);
    } else if (floorScene.isolation() !== null || nearKey !== "") {
      floorScene.setIsolation(null);
      floorScene.setWallFade(null);
      nearKey = "";
      near = new Set();
      context.applyMaterials(true);
    }
    if (room !== null && mode === "dome") {
      patchAll();
      const keep = keepBox(room);
      uniforms.hpCutKeep.value.set(keep.minX, keep.minZ, keep.maxX, keep.maxZ);
      uniforms.hpCutOn.value = 1;
    } else {
      uniforms.hpCutOn.value = 0;
      funnel = null;
    }
    context.invalidate();
  };

  return {
    cutUniforms: uniforms,
    mode: () => mode,
    setMode: (next) => {
      if (next === mode) return;
      mode = next;
      apply();
    },
    focus: (areaId) => {
      if (areaId === focused?.areaId) return;
      const bounds = areaId === null ? null : floorScene.areaBounds(areaId);
      focused =
        areaId === null || bounds === null
          ? null
          : {
              areaId,
              center: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
              bounds,
            };
      apply();
    },
    update: (eye) => {
      const room = focused;
      if (room === null) return;
      if (mode === "fade") applyNear(nearWalls(room, eye));
      else if (mode === "dome") updateFunnel(eye);
    },
    wallFade: (wallId) => (wallId !== undefined && near.has(wallId) ? "faded" : "normal"),
    afterMaterials: () => {
      if (uniforms.hpCutOn.value > 0) patchAll();
    },
    looksThrough: (hit) => {
      const room = focused;
      if (room === null) return false;
      if (mode === "fade") {
        const material = hitMaterial(hit);
        return material !== null && material.transparent && material.opacity < fadedOpacity;
      }
      if (mode === "dome" && funnel !== null) {
        if (!wallMeshes().has(hit.object)) {
          const keep = keepBox(room);
          const p = hit.point;
          if (p.x >= keep.minX && p.x <= keep.maxX && p.z >= keep.minZ && p.z <= keep.maxZ) return false;
        }
        return cutAmount(funnel, { x: hit.point.x, y: hit.point.y, z: hit.point.z }) > 0.5;
      }
      return false;
    },
  };
};
