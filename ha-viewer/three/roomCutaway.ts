// The room cutaway (Phase 8.2a): while a room is open, what stands between the camera and the room gets out of
// the way. The viewer always uses C, the dithered fade (owner, Phase 21.3, 2026-11-20: much faster, no visible
// difference); A remains its fallback, and variant B's code is kept unused for now.
//
// A. "fade" (C's fallback): the builder's isolation fades every other room (walls, floors, objects, fixtures) to the
//    "dimmed" level, and the room's own walls on the camera's side to "faded" (src/renderer/surfaceMaterialKey.ts
//    opacities); the near walls follow the camera as it orbits. A neighbour's door or window in a wall the room
//    shares counts as the room's own (Phase 15.7, scene().entityFade): clear, its doorway cut through the
//    room's wall layer, and faded with the room's wall there when that wall is near.
// B. "dome": the reverse-dome mask (cutawayFunnel.ts): every mesh material gets a shader test that discards, with a
//    dithered soft edge, whatever lies above the funnel from a ring around the house down to the room's floor
//    centre. The room's own contents inside its plan box are never cut; its walls are.
// C. "dither" (default; Phase 21.3, ditherFade.ts): the fade's look without its cost. A shader test on every
//    material skips a fixed pattern of pixels outside the room (and on its near walls), so opening a room changes
//    uniforms only: no isolation layers, no faded material copies, no shadow redraw. A room whose outline is not
//    known (walls off) or has too many edges falls back to A.
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
import type { DitherEdge, GroundPoint } from "./ditherFade";
import { distanceToSegment, ditherGlsl, ditherLevel, maxDitherEdges, nearEdges } from "./ditherFade";

export type CutawayMode = "fade" | "dome" | "dither" | "off";

export const cutawayModes: readonly CutawayMode[] = ["fade", "dome", "dither", "off"];

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

/** C: the open room's outline on the ground (world m), its centre, and how far its walls reach out (m). */
type DitherRoom = Readonly<{
  edges: readonly Readonly<{ a: GroundPoint; b: GroundPoint }>[];
  center: GroundPoint;
  margin: number;
}>;

type Focus = Readonly<{
  areaId: string;
  /** C only: the outline the shader tests; null falls back to A. */
  dither: DitherRoom | null;
  /** The room's floor centre and box, plan mm. */
  center: Readonly<{ x: number; y: number }>;
  bounds: Readonly<{ minX: number; minY: number; maxX: number; maxY: number }>;
}>;

export const createRoomCutaway = (
  context: CutawayContext,
  params: FunnelParams = defaultFunnelParams,
): RoomCutaway => {
  const { planRoot } = context;
  // Read on every use: the host's shown floor (and so its scene) changes with the view (Phase 21.4).
  const scene = (): FloorScene => context.floorScene;
  let mode: CutawayMode = "dither";
  let focused: Focus | null = null;
  let nearKey = "";
  let near: ReadonlySet<string> = new Set();
  let funnel: Funnel | null = null;
  const patched = new WeakMap<Material, Role>();
  const ditherPatched = new WeakMap<Material, Role>();
  let ditherEdges: readonly DitherEdge[] = [];
  let ditherNearKey = "";
  const ditherUniforms = {
    hpDitherOn: { value: 0 },
    hpDitherCount: { value: 0 },
    hpDitherMargin: { value: 0 },
    hpDitherEdges: { value: Array.from({ length: maxDitherEdges }, () => new Vector4()) },
    hpDitherNear: { value: Array.from({ length: maxDitherEdges / 4 }, () => new Vector4()) },
  };
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

  const wallMeshes = (): Set<Object3D> =>
    new Set(
      scene()
        .wallLayers()
        .map((layer) => layer.mesh),
    );

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
    const bounds = scene().bounds();
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

  // ---- C: the dithered fade -----------------------------------------------------------------------------

  const patchDither = (material: Material, role: Role): void => {
    if (ditherPatched.get(material) === role) return;
    ditherPatched.set(material, role);
    setMaterialPatch(material, "hpdither", {
      key: () => role,
      apply: (shader) => {
        Object.assign(shader.uniforms, ditherUniforms);
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 hpDitherWorld;")
          .replace(
            "#include <project_vertex>",
            "#include <project_vertex>\n  hpDitherWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
          );
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", `#include <common>\n${ditherGlsl}`)
          .replace(
            "void main() {",
            `void main() {\n  if (hpDitherAway(${role === "wall" ? "true" : "false"})) discard;`,
          );
      },
    });
  };

  /** Patched once per material while C is the mode, opened or not, so opening a room compiles nothing. */
  const patchAllDither = (): void => {
    const walls = wallMeshes();
    planRoot.traverse((object) => {
      if (!isMesh(object)) return;
      const role: Role = walls.has(object) ? "wall" : "content";
      for (const material of materialsOf(object)) {
        if (!patchable(material)) continue;
        if (ditherPatched.get(material) === "wall") continue;
        patchDither(material, role);
      }
    });
  };

  /** The room's outline as ground edges and its walls' reach beyond it; null without an outline or with too many edges. */
  const ditherRoom = (areaId: string): DitherRoom | null => {
    const room = scene()
      .indoorRooms()
      .rooms.find((candidate) => candidate.areaId === areaId);
    if (room === undefined) return null;
    const ground = (x: number, y: number): GroundPoint => {
      const world = toWorld(x, y, 0);
      return { x: world.x, z: world.z };
    };
    const edges: { a: GroundPoint; b: GroundPoint }[] = [];
    for (const polygon of room.outline.polygons)
      for (const ring of [polygon.outer, ...polygon.holes])
        ring.forEach((point, index) => {
          const next = ring[(index + 1) % ring.length];
          if (next !== undefined) edges.push({ a: ground(point.x, point.y), b: ground(next.x, next.y) });
        });
    if (edges.length === 0 || edges.length > maxDitherEdges) return null;
    // The walls' reach: the farthest corner of the room's wall bands from its outline, plus a little.
    let reach = 0;
    for (const layer of scene().wallLayers())
      for (const band of layer.walls.bands) {
        if (band.areaId !== areaId) continue;
        for (const point of band.ring) {
          const p = ground(point.x, point.y);
          const level = edges.reduce(
            (best, { a, b }) => Math.min(best, distanceToSegment(p, a, b)),
            Infinity,
          );
          reach = Math.max(reach, Math.min(level, 1));
        }
      }
    const xs = edges.map(({ a }) => a.x);
    const zs = edges.map(({ a }) => a.z);
    return {
      edges,
      center: { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 },
      margin: reach + 0.005,
    };
  };

  const setDitherEdges = (room: DitherRoom, eye: Vector3): void => {
    const edges = nearEdges(room.edges, room.center, { x: eye.x, z: eye.z });
    const key = edges.map((edge) => (edge.near ? "1" : "0")).join("");
    ditherEdges = edges;
    if (key === ditherNearKey) return;
    ditherNearKey = key;
    edges.forEach((edge, index) => {
      ditherUniforms.hpDitherEdges.value[index]?.set(edge.a.x, edge.a.z, edge.b.x, edge.b.z);
      ditherUniforms.hpDitherNear.value[Math.floor(index / 4)]?.setComponent(index % 4, edge.near ? 1 : 0);
    });
    ditherUniforms.hpDitherCount.value = edges.length;
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
    for (const layer of scene().wallLayers())
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
    scene().setWallFade(
      next.size === 0 ? null : (wallId): FadeLevel => (next.has(wallId) ? "faded" : "normal"),
    );
    context.applyMaterials(false);
  };

  // ---- both ---------------------------------------------------------------------------------------------

  const apply = (): void => {
    const room = focused;
    const dithered = room !== null && mode === "dither" && room.dither !== null;
    if (dithered) {
      ditherUniforms.hpDitherMargin.value = room.dither.margin;
      ditherNearKey = "";
      ditherUniforms.hpDitherOn.value = 1;
    } else {
      ditherUniforms.hpDitherOn.value = 0;
      ditherEdges = [];
    }
    if (room !== null && (mode === "fade" || (mode === "dither" && !dithered))) {
      scene().setIsolation({
        areaId: room.areaId,
        others: "faded",
        fadeOwnContent: false,
        othersLocked: false,
      });
      nearKey = "";
      near = new Set();
      scene().setWallFade(null);
      context.applyMaterials(true);
    } else if (scene().isolation() !== null || nearKey !== "") {
      scene().setIsolation(null);
      scene().setWallFade(null);
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
      if (mode === "dither") patchAllDither();
      apply();
    },
    focus: (areaId) => {
      if (areaId === focused?.areaId) return;
      const bounds = areaId === null ? null : scene().areaBounds(areaId);
      focused =
        areaId === null || bounds === null
          ? null
          : {
              areaId,
              dither: mode === "dither" ? ditherRoom(areaId) : null,
              center: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
              bounds,
            };
      apply();
    },
    update: (eye) => {
      const room = focused;
      if (room === null) return;
      if (mode === "dither" && room.dither !== null) setDitherEdges(room.dither, eye);
      else if (mode === "fade" || mode === "dither") applyNear(nearWalls(room, eye));
      else if (mode === "dome") updateFunnel(eye);
    },
    wallFade: (wallId) => (wallId !== undefined && near.has(wallId) ? "faded" : "normal"),
    afterMaterials: () => {
      if (uniforms.hpCutOn.value > 0) patchAll();
      if (mode === "dither") patchAllDither();
    },
    looksThrough: (hit) => {
      const room = focused;
      if (room === null) return false;
      if (mode === "dither" && room.dither !== null) {
        const wall = wallMeshes().has(hit.object);
        return ditherLevel({ x: hit.point.x, z: hit.point.z }, ditherEdges, room.dither.margin, wall) < 0.5;
      }
      if (mode === "fade" || mode === "dither") {
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
