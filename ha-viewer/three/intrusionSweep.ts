// Presence / intrusion sweeps (Phase 8.6, K18, Q6): while a room's presence entity is active, each chosen corner
// shows a pulsing red cone of light sweeping slowly across the room, and the room tints faintly red.
//
// How it is drawn (an overlay, not a light): no three.js light is added, so the shadow budget and the house's
// materials are untouched (8.9 owns them). Instead every drawn mesh of the room (floor, carpets, objects, doors,
// windows, fixtures) and the floor's wall layers get a twin that shares the mesh's geometry and world matrix and
// draws with one small ShaderMaterial: per fragment it adds the red of every cone that contains it (soft edge,
// distance falloff, a Lambert term toward the sensor) plus the tint, masked to the room's outline (a few cm
// beyond it, which catches the walls' interior faces; faces turned away from the room are skipped). Twins draw
// after the house with depth test (less-or-equal, pulled forward by a polygon offset) and no depth writes,
// blended as `src + dst · (1 − a)`, so the red reads on dark night floors and on white day floors alike. Faded
// surfaces (the 8.2a cutaway's A, isolation) get no twin face; the 8.2a dome (B) cuts twins with the same uniforms
// and formula as the house (`funnelGlsl`, shared by reference, not by patching materials). Twins live on the
// effects layer outside the plan root: no picking, no shadows, no export, hidden from the glass reflection.
//
// Frames: a timer asks for view-only frames (24 fps) only while a sweep runs; nothing active means no timer
// and no frames. Frames never set `shadowMap.needsUpdate`. Reduced motion: static cones, one frame per change.
import {
  CustomBlending,
  FrontSide,
  Group,
  LessEqualDepth,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import type { Camera, Material, Object3D } from "three";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { HaSweepCornerValue } from "@shared/domain/schemas/homeAssistant";
import { maxSweepCorners } from "@shared/domain/schemas/homeAssistant";
import { effectsLayer } from "../../src/renderer/effectsLayer";
import type { FloorScene } from "../../src/renderer/floorScene";
import { isMesh } from "../../src/renderer/sceneObjects";
import { funnelGlsl } from "./cutawayFunnel";
import type { CutUniforms } from "./roomCutaway";
import {
  chosenCorners,
  cornerNear,
  sweepAxis,
  sweepConventions,
  sweepPulse,
  sweepRoom,
  sweepSource,
  toggleCorner,
} from "./sweepGeometry";
import type { RoomCorner, SweepRoom, SweepSource } from "./sweepGeometry";

/** A room whose presence entity is active, with its stored corners (undefined: the default two). */
export type IntrusionRoom = Readonly<{ areaId: string; corners: readonly HaSweepCornerValue[] | undefined }>;

export type SweepContext = Readonly<{
  /** The plan root (plan mm → world m). */
  planRoot: Object3D;
  floorScene: FloorScene;
  /** The 8.2a dome's uniforms, so twins are cut like the house. */
  cutUniforms: CutUniforms;
  camera: Camera;
  canvas: HTMLCanvasElement;
  /** A view-only frame (the viewer's requestRender; never redraws shadow maps). */
  requestFrame: () => void;
}>;

export type IntrusionSweeps = Readonly<{
  /** Add to the scene (not under the plan root). */
  root: Object3D;
  /** The shown floor; call after the floor scene's sync. */
  setFloor: (floor: BuildingFloorValue | null) => void;
  /** The rooms that sweep now; an empty list stops everything (no timer, no frames). */
  setActive: (rooms: readonly IntrusionRoom[]) => void;
  /** Corner picking for one room (markers on its corners), or null to stop. */
  setPicking: (picking: IntrusionRoom | null) => void;
  picking: () => boolean;
  /** The picking room's corner list after a tap near one of its corners, or null when the tap is near none. */
  pickCorner: (clientX: number, clientY: number) => readonly HaSweepCornerValue[] | null;
  /** Every frame before rendering. */
  beforeRender: () => void;
  /** Hides the twins and markers (the glass reflection pass) or shows them again. */
  setShown: (shown: boolean) => void;
  /** Stops the sweep timer while the viewport is off screen (16.11); resuming restarts it. */
  setPaused: (paused: boolean) => void;
  dispose: () => void;
}>;

/** Most outline vertices the light's mask takes; a room with more is masked by its bounding box. */
const maxOutline = 48;
/** The mask reaches this far beyond the outline (mm): the walls' interior faces of outside-aligned walls. */
const outlineMarginMm = 40;
/** Light colour (display values) and strengths (implementation conventions). */
const red = new Vector3(1, 0.07, 0.05);
const coneStrength = 0.75;
const tintStrength = 0.09;
/** A surface fainter than this counts as faded and gets no light (the cutaway's A). */
const fadedOpacity = 0.5;
const markerRadiusMm = 70;
const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

const vertexShader = /* glsl */ `
uniform mat4 uPlanFromWorld;
varying vec3 vPlan;
varying vec3 vPlanNormal;
varying vec3 hpCutWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  hpCutWorld = world.xyz;
  vPlan = (uPlanFromWorld * world).xyz;
  vPlanNormal = mat3(uPlanFromWorld) * (mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
#define MAX_CONES ${String(maxSweepCorners)}
#define MAX_OUTLINE ${String(maxOutline)}
uniform vec3 uSources[MAX_CONES];
uniform vec3 uAxes[MAX_CONES];
uniform int uCount;
uniform float uCosOuter;
uniform float uCosInner;
uniform float uRange;
uniform float uPulse;
uniform float uTint;
uniform float uCone;
uniform vec3 uColor;
uniform vec2 uOutline[MAX_OUTLINE];
uniform int uOutlineCount;
uniform float uMargin;
uniform vec3 uCenter;
varying vec3 vPlan;
varying vec3 vPlanNormal;
${funnelGlsl}

// Inside the outline, or within the margin of one of its edges.
bool inRoom(vec2 p) {
  bool inside = false;
  float nearest = 1e9;
  for (int i = 0; i < MAX_OUTLINE; i++) {
    if (i >= uOutlineCount) break;
    int j = i == 0 ? uOutlineCount - 1 : i - 1;
    vec2 a = uOutline[i];
    vec2 b = uOutline[j];
    if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    vec2 ab = b - a;
    float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    nearest = min(nearest, length(p - (a + ab * t)));
  }
  return inside || nearest < uMargin;
}

void main() {
  if (hpCutAway(HP_CONTENT)) discard;
  if (!inRoom(vPlan.xy)) discard;
  vec3 n = length(vPlanNormal) > 1e-4 ? normalize(vPlanNormal) : vec3(0.0, 0.0, 1.0);
  // Faces turned away from the room (a wall's exterior face) get nothing; floors and tops always count.
  if (n.z < 0.7 && dot(n, normalize(uCenter - vPlan)) < -0.2) discard;
  float light = 0.0;
  for (int i = 0; i < MAX_CONES; i++) {
    if (i >= uCount) break;
    vec3 toSource = uSources[i] - vPlan;
    float d = length(toSource);
    vec3 l = toSource / max(d, 1.0);
    float cone = smoothstep(uCosOuter, uCosInner, dot(-l, uAxes[i]));
    if (cone <= 0.0) continue;
    float lambert = max(dot(n, l), 0.0);
    float falloff = 1.0 / (1.0 + (d / uRange) * (d / uRange));
    light += cone * (0.35 + 0.65 * lambert) * falloff;
  }
  float strength = clamp(light * uPulse * uCone + uTint, 0.0, 0.9);
  if (strength <= 0.002) discard;
  gl_FragColor = vec4(uColor * strength, strength * 0.65);
}
`;

type RoomUniforms = Readonly<{
  uPlanFromWorld: { value: Matrix4 };
  uSources: { value: Vector3[] };
  uAxes: { value: Vector3[] };
  uCount: { value: number };
  uCosOuter: { value: number };
  uCosInner: { value: number };
  uRange: { value: number };
  uPulse: { value: number };
  uTint: { value: number };
  uCone: { value: number };
  uColor: { value: Vector3 };
  uOutline: { value: Vector2[] };
  uOutlineCount: { value: number };
  uMargin: { value: number };
  uCenter: { value: Vector3 };
}>;

/** One sweeping room: its geometry, sensors, shader state, and the twins of its meshes. */
type Sweep = {
  readonly room: SweepRoom;
  readonly sources: readonly SweepSource[];
  readonly uniforms: RoomUniforms;
  /** Wall role (cut as walls by the dome) and content role (the room's own contents are never cut). */
  readonly wallMaterial: ShaderMaterial;
  readonly contentMaterial: ShaderMaterial;
  readonly twins: Map<Mesh, Mesh>;
  readonly group: Group;
  readonly dots: Group;
};

const halfAngle = (sweepConventions.coneHalfAngleDeg * Math.PI) / 180;

const roomUniforms = (room: SweepRoom): RoomUniforms => {
  const outline =
    room.outline.length <= maxOutline
      ? room.outline
      : (() => {
          const xs = room.outline.map((point) => point.x);
          const ys = room.outline.map((point) => point.y);
          const [minX, maxX, minY, maxY] = [
            Math.min(...xs),
            Math.max(...xs),
            Math.min(...ys),
            Math.max(...ys),
          ];
          return [
            { x: minX, y: minY },
            { x: maxX, y: minY },
            { x: maxX, y: maxY },
            { x: minX, y: maxY },
          ];
        })();
  const cx = outline.reduce((sum, point) => sum + point.x, 0) / outline.length;
  const cy = outline.reduce((sum, point) => sum + point.y, 0) / outline.length;
  return {
    uPlanFromWorld: { value: new Matrix4() },
    uSources: { value: Array.from({ length: maxSweepCorners }, () => new Vector3()) },
    uAxes: { value: Array.from({ length: maxSweepCorners }, () => new Vector3(1, 0, 0)) },
    uCount: { value: 0 },
    uCosOuter: { value: Math.cos(halfAngle) },
    uCosInner: { value: Math.cos(halfAngle * (1 - sweepConventions.coneSoftShare)) },
    uRange: { value: Math.max(room.diagonalMm * 0.9, 2500) },
    uPulse: { value: 1 },
    uTint: { value: tintStrength },
    uCone: { value: coneStrength },
    uColor: { value: red.clone() },
    uOutline: {
      value: Array.from({ length: maxOutline }, (_, index) => {
        const point = outline[index];
        return point === undefined ? new Vector2() : new Vector2(point.x, point.y);
      }),
    },
    uOutlineCount: { value: outline.length },
    uMargin: { value: outlineMarginMm },
    uCenter: { value: new Vector3(cx, cy, room.sensorMm / 2) },
  };
};

const twinMaterial = (uniforms: RoomUniforms, cut: CutUniforms, content: boolean): ShaderMaterial =>
  new ShaderMaterial({
    name: content ? "HomeplanIntrusionContent" : "HomeplanIntrusionWall",
    uniforms: { ...uniforms, ...cut },
    vertexShader,
    fragmentShader,
    defines: { HP_CONTENT: content ? "true" : "false" },
    side: FrontSide,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    depthFunc: LessEqualDepth,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    toneMapped: false,
    fog: false,
  });

/** A material a twin face skips: never drawn. */
const skipped = new MeshBasicMaterial({ visible: false });

const faded = (material: Material): boolean => material.transparent && material.opacity < fadedOpacity;

/** Drawn: the object and every parent are visible. */
const drawn = (object: Object3D): boolean => {
  for (let current: Object3D | null = object; current !== null; current = current.parent)
    if (!current.visible) return false;
  return true;
};

export const createIntrusionSweeps = (context: SweepContext): IntrusionSweeps => {
  const { planRoot, floorScene, cutUniforms, camera, canvas, requestFrame } = context;
  const root = new Group();
  root.name = "intrusion-sweeps";
  /** Plan-frame children (markers, sensor dots): their matrix follows the plan root. */
  const planSpace = new Group();
  planSpace.matrixAutoUpdate = false;
  root.add(planSpace);
  const markerGeometry = new SphereGeometry(markerRadiusMm, 16, 12);
  const chosenMarker = new MeshBasicMaterial({ color: 0xe53935, depthTest: false, transparent: true });
  const freeMarker = new MeshBasicMaterial({
    color: 0xffffff,
    depthTest: false,
    transparent: true,
    opacity: 0.85,
  });
  const dotMaterial = new MeshBasicMaterial({ color: 0xff3b30, toneMapped: false });
  const markers = new Group();
  planSpace.add(markers);

  let rooms = new Map<string, SweepRoom>();
  let active: readonly IntrusionRoom[] = [];
  const sweeps = new Map<string, Sweep>();
  let picking: IntrusionRoom | null = null;
  let pickCorners: readonly RoomCorner[] = [];
  let pickChosen: readonly RoomCorner[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let paused = false;
  const startMs = performance.now();
  const media = typeof window === "undefined" ? null : window.matchMedia(reducedMotionQuery);
  let still = media?.matches ?? false;

  const layered = <T extends Object3D>(object: T): T => {
    object.layers.set(effectsLayer);
    object.castShadow = false;
    object.receiveShadow = false;
    return object;
  };

  const marker = (position: Vector3, material: MeshBasicMaterial, scale = 1): Mesh => {
    const mesh = layered(new Mesh(markerGeometry, material));
    mesh.position.copy(position);
    mesh.scale.setScalar(scale);
    mesh.renderOrder = 20;
    return mesh;
  };

  // ---- the timer: only while a sweep runs ------------------------------------------------------------

  const stopTimer = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const schedule = (): void => {
    stopTimer();
    if (disposed || still || paused || sweeps.size === 0) return;
    timer = setTimeout(() => {
      timer = null;
      requestFrame();
      schedule();
    }, 1000 / sweepConventions.framesPerSecond);
  };

  const onMotionChange = (event: MediaQueryListEvent): void => {
    still = event.matches;
    schedule();
    requestFrame();
  };
  media?.addEventListener("change", onMotionChange);

  // ---- sweeps ---------------------------------------------------------------------------------------------

  const disposeSweep = (sweep: Sweep): void => {
    root.remove(sweep.group);
    planSpace.remove(sweep.dots);
    sweep.wallMaterial.dispose();
    sweep.contentMaterial.dispose();
    sweep.twins.clear();
  };

  const buildSweep = (target: IntrusionRoom, room: SweepRoom): Sweep => {
    const sources = chosenCorners(room, target.corners).map((corner) => sweepSource(room, corner));
    const uniforms = roomUniforms(room);
    uniforms.uCount.value = sources.length;
    sources.forEach((source, index) => {
      uniforms.uSources.value[index]?.set(source.position.x, source.position.y, source.position.h);
    });
    const group = new Group();
    group.name = `intrusion:${room.areaId}`;
    root.add(group);
    const dots = new Group();
    for (const source of sources)
      dots.add(
        marker(new Vector3(source.position.x, source.position.y, source.position.h), dotMaterial, 0.6),
      );
    for (const dot of dots.children) dot.renderOrder = 0;
    planSpace.add(dots);
    return {
      room,
      sources,
      uniforms,
      wallMaterial: twinMaterial(uniforms, cutUniforms, false),
      contentMaterial: twinMaterial(uniforms, cutUniforms, true),
      twins: new Map(),
      group,
      dots,
    };
  };

  const rebuild = (): void => {
    for (const sweep of sweeps.values()) disposeSweep(sweep);
    sweeps.clear();
    for (const target of active) {
      const room = rooms.get(target.areaId);
      if (room !== undefined) sweeps.set(target.areaId, buildSweep(target, room));
    }
    schedule();
    requestFrame();
  };

  /** A twin's material per source material: the room's light, or skipped where the source is faded. */
  const twinMaterials = (source: Mesh, light: ShaderMaterial): Material | Material[] => {
    const material: Material | Material[] = source.material;
    if (Array.isArray(material)) return material.map((entry) => (faded(entry) ? skipped : light));
    return faded(material) ? skipped : light;
  };

  /** The room's drawn meshes (its area group) and the floor's wall layers, each with an up-to-date twin. */
  const syncTwins = (sweep: Sweep): void => {
    const walls = new Set<Mesh>(floorScene.wallLayers().map((layer) => layer.mesh));
    const wanted = new Map<Mesh, ShaderMaterial>();
    for (const mesh of walls) if (drawn(mesh)) wanted.set(mesh, sweep.wallMaterial);
    const group = floorScene.areaGroup(sweep.room.areaId);
    group?.traverse((object) => {
      if (!isMesh(object) || walls.has(object) || !object.layers.isEnabled(0) || !drawn(object)) return;
      wanted.set(object, sweep.contentMaterial);
    });
    for (const [source, twin] of sweep.twins)
      if (!wanted.has(source)) {
        sweep.group.remove(twin);
        sweep.twins.delete(source);
      }
    for (const [source, light] of wanted) {
      let twin = sweep.twins.get(source);
      if (twin?.geometry !== source.geometry) {
        if (twin !== undefined) sweep.group.remove(twin);
        twin = layered(new Mesh(source.geometry, light));
        twin.matrixAutoUpdate = false;
        twin.renderOrder = 5;
        sweep.twins.set(source, twin);
        sweep.group.add(twin);
      }
      twin.material = twinMaterials(source, light);
      source.updateWorldMatrix(true, false);
      twin.matrix.copy(source.matrixWorld);
      twin.matrixWorldNeedsUpdate = true;
    }
  };

  // ---- corner picking ----------------------------------------------------------------------------------

  const showMarkers = (): void => {
    markers.clear();
    const target = picking;
    const room = target === null ? undefined : rooms.get(target.areaId);
    if (target === null || room === undefined) {
      pickCorners = [];
      pickChosen = [];
      requestFrame();
      return;
    }
    pickCorners = room.corners;
    pickChosen = chosenCorners(room, target.corners);
    for (const corner of room.corners) {
      const source = sweepSource(room, corner);
      const chosen = pickChosen.includes(corner);
      markers.add(
        marker(
          new Vector3(source.position.x, source.position.y, source.position.h),
          chosen ? chosenMarker : freeMarker,
          chosen ? 1.25 : 1,
        ),
      );
    }
    requestFrame();
  };

  /** A plan point at sensor height in CSS pixels relative to the page, or null behind the camera. */
  const toScreen = (room: SweepRoom, corner: RoomCorner): Readonly<{ x: number; y: number }> | null => {
    const source = sweepSource(room, corner);
    planRoot.updateMatrixWorld(true);
    const world = planRoot.localToWorld(new Vector3(source.position.x, source.position.y, source.position.h));
    const ndc = world.project(camera);
    if (ndc.z > 1) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + ((ndc.x + 1) / 2) * rect.width, y: rect.top + ((1 - ndc.y) / 2) * rect.height };
  };

  return {
    root,
    setFloor: (floor) => {
      rooms = new Map();
      for (const area of floor?.areas ?? []) {
        const room = sweepRoom(area);
        if (room !== null) rooms.set(area.id, room);
      }
      rebuild();
      showMarkers();
    },
    setActive: (next) => {
      const key = (list: readonly IntrusionRoom[]): string => JSON.stringify(list);
      if (key(next) === key(active)) return;
      active = next;
      rebuild();
    },
    setPicking: (next) => {
      picking = next;
      showMarkers();
    },
    picking: () => picking !== null,
    pickCorner: (clientX, clientY) => {
      const target = picking;
      const room = target === null ? undefined : rooms.get(target.areaId);
      if (target === null || room === undefined) return null;
      const corner = cornerNear(
        pickCorners.map((item) => ({ item, screen: toScreen(room, item) })),
        { x: clientX, y: clientY },
      );
      return corner === null ? null : toggleCorner(pickChosen, corner);
    },
    beforeRender: () => {
      planRoot.updateMatrixWorld(true);
      planSpace.matrix.copy(planRoot.matrixWorld);
      planSpace.matrixWorldNeedsUpdate = true;
      if (sweeps.size === 0) return;
      const inverse = new Matrix4().copy(planRoot.matrixWorld).invert();
      const timeMs = performance.now() - startMs;
      const pulse = sweepPulse(timeMs, still);
      for (const sweep of sweeps.values()) {
        sweep.uniforms.uPlanFromWorld.value.copy(inverse);
        sweep.uniforms.uPulse.value = pulse;
        sweep.sources.forEach((source, index) => {
          const axis = sweepAxis(source, index, timeMs, still);
          sweep.uniforms.uAxes.value[index]?.set(axis.x, axis.y, axis.h);
        });
        syncTwins(sweep);
      }
    },
    setShown: (shown) => {
      root.visible = shown;
    },
    setPaused: (next) => {
      if (next === paused) return;
      paused = next;
      schedule();
    },
    dispose: () => {
      disposed = true;
      stopTimer();
      media?.removeEventListener("change", onMotionChange);
      for (const sweep of sweeps.values()) disposeSweep(sweep);
      sweeps.clear();
      markers.clear();
      markerGeometry.dispose();
      chosenMarker.dispose();
      freeMarker.dispose();
      dotMaterial.dispose();
    },
  };
};
