// Ambient effects (D24, spec/builder/features/ambient-effects.md): small stop-motion animations on objects, a
// swirl (wind-like curled strokes) or vapour (soft rising wisps). Every effect runs for 3.5 s at 8 frames per
// second once every 20 s, at its own stable phase, so effects do not fire together. The frames are generated
// here procedurally (no asset format): a few camera-facing ribbons whose shape changes from frame to frame.
//
// Rendering stays on demand: a timer wakes only for the next frame of a running effect (or the next start)
// and asks for a view-only frame (`requestFrame`, the runtime's `redraw`), so effect frames never redraw the
// static shadow maps (Phase 7.10). Effect meshes live on their own layer, which exports never render, cast no
// shadows, and never take part in picking. Framework-free, shared by the builder and the HA viewer (D23).
//
// Live state (Phase 8.4, spec/home-assistant/bindings.md): the HA viewer marks effects active or inactive and gives
// them a variant's overrides (`setLive`). An inactive effect is hidden and has no timer; when no effect is active
// nothing is scheduled at all, so the effects request no frames (K12). The builder never calls `setLive` and keeps
// the authored effects.
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";
import type { Object3D } from "three";
import type { AmbientEffectValue, EffectKind } from "@shared/domain/schemas/effects";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import { isMesh } from "./sceneObjects";

/** Three.js layer of ambient effects: shown by the builder and HA viewer cameras, never by exports. */
export const effectsLayer = 2;

/** Implementation conventions (P8). */
export const effectPeriodMs = 20_000;
export const effectRunMs = 3_500;
const framesPerSecond = 8;
const tickMs = 1000 / framesPerSecond;
const ticksPerRun = Math.round(effectRunMs / tickMs);
/** Distinct drawings per kind; the run cycles through them (stop-motion). */
const frameCount = 7;
/** How far an effect travels during one run, as a share of its size. */
const driftShare = 0.45;
/** The still frame shown for `prefers-reduced-motion`. */
const stillFrame = 3;

/** A variant's overrides of the authored look (absent fields keep the authored value). */
export type EffectOverrides = Readonly<
  Partial<Pick<AmbientEffectValue, "kind" | "color" | "direction" | "sizeMm">>
>;

/** An effect's live state: inactive effects are hidden and request no frames; active ones use the overrides. */
export type EffectLive = Readonly<{ active: boolean; overrides: EffectOverrides | null }>;

export type EffectsLayer = Readonly<{
  /**
   * Builds the effects of the floor's objects; call after the instance layer's sync. `instanceRoot` gives each
   * object's placed model group: an effect is drawn next to it, in its frame, and hides with it.
   */
  sync: (floor: BuildingFloorValue | null, instanceRoot: (instanceId: string) => Object3D | null) => void;
  /** Copies each object's placement and visibility onto its effects; call right before every render. */
  beforeRender: () => void;
  /** Plays these effects (or every effect of these objects) once, starting now (builder preview). */
  preview: (ids: readonly string[]) => void;
  /** Plays every effect once, starting now (the header's effects toggle switched on). */
  playAll: () => void;
  /**
   * Live states by effect ID (HA viewer); an effect missing from the map keeps its authored behaviour. An effect
   * that becomes active, or changes its look while active, plays once at once, then keeps its 20 s cycle.
   */
  setLive: (states: ReadonlyMap<string, EffectLive>) => void;
  /** Hides every effect (the HA viewer's glass reflection) or shows them again. */
  setShown: (shown: boolean) => void;
  /** Stops the effects' timer while the viewport is off screen (16.11); resuming restarts it. */
  setPaused: (paused: boolean) => void;
  dispose: () => void;
}>;

// ---------------------------------------------------------------------------------------------
// Procedural frames: ribbons in a unit 2D frame (u = along the travel direction, v = across it).

type StrokePoint = Readonly<{ u: number; v: number; halfWidth: number; alpha: number }>;

/** A small deterministic PRNG (mulberry32): the same "hand-made" jitter every run. */
const random = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const jitter = (next: () => number, amount: number): number => (next() * 2 - 1) * amount;

/** Three strokes, each a gentle wave ending in a curl that winds tighter from frame to frame. */
const swirlStrokes = (frame: number): StrokePoint[][] => {
  const next = random(0x5317 + frame * 101);
  const phase = frame / frameCount;
  const strokes: StrokePoint[][] = [];
  for (let s = 0; s < 3; s += 1) {
    const lane = s - 1;
    const vBase = lane * 0.24 + jitter(next, 0.025);
    const uStart = 0.06 * Math.abs(lane) + jitter(next, 0.04);
    const waveLength = 0.5 + jitter(next, 0.06);
    const amplitude = 0.035 + jitter(next, 0.012);
    const wavePhase = 2 * Math.PI * (phase + s * 0.31);
    const waveSteps = 14;
    const raw: { u: number; v: number }[] = [];
    for (let i = 0; i <= waveSteps; i += 1) {
      const t = i / waveSteps;
      raw.push({
        u: uStart + t * waveLength,
        v: vBase + amplitude * Math.sin(wavePhase + t * 2 * Math.PI * 1.1),
      });
    }
    const end = raw[raw.length - 1] ?? { u: 0, v: 0 };
    const sign = lane < 0 ? -1 : 1;
    const radius = 0.085 + jitter(next, 0.015) + 0.015 * Math.sin(2 * Math.PI * phase);
    const sweep = Math.PI * (1.05 + 0.9 * (((frame + s * 2) % frameCount) / (frameCount - 1)));
    const center = { u: end.u, v: end.v + sign * radius };
    const start = -sign * (Math.PI / 2);
    const curlSteps = 18;
    for (let k = 1; k <= curlSteps; k += 1) {
      const share = k / curlSteps;
      const angle = start + sign * share * sweep;
      const r = radius * (1 - 0.6 * share);
      raw.push({ u: center.u + r * Math.cos(angle), v: center.v + r * Math.sin(angle) });
    }
    const width = 0.034 + jitter(next, 0.005);
    strokes.push(
      raw.map((point, index) => {
        const tau = index / (raw.length - 1);
        return {
          ...point,
          halfWidth: width * Math.pow(Math.sin(Math.PI * Math.min(0.98, Math.max(0.02, tau))), 0.6),
          alpha: Math.min(1, tau * 5) * (1 - 0.25 * tau),
        };
      }),
    );
  }
  return strokes;
};

/** Three soft wavy wisps that widen and fade as they rise. */
const vapourStrokes = (frame: number): StrokePoint[][] => {
  const next = random(0x7a90 + frame * 131);
  const phase = frame / frameCount;
  const strokes: StrokePoint[][] = [];
  for (let s = 0; s < 3; s += 1) {
    const vBase = (s - 1) * 0.16 + jitter(next, 0.03);
    const length = 0.8 + jitter(next, 0.1);
    const wavePhase = 2 * Math.PI * (phase * 1.3 + s * 0.4);
    const steps = 24;
    const points: StrokePoint[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const spread = 0.03 + 0.09 * t;
      points.push({
        u: t * length,
        v: vBase + spread * Math.sin(wavePhase + t * 2 * Math.PI * 1.4) + jitter(next, 0.004),
        halfWidth: 0.03 + 0.06 * t,
        alpha: Math.min(1, t * 6) * Math.pow(1 - t, 1.3) * 0.8,
      });
    }
    strokes.push(points);
  }
  return strokes;
};

/** One indexed ribbon mesh per frame: position (u, v, 0), `edge` (−1..1 across), and `fade` (along). */
const ribbonGeometry = (strokes: readonly (readonly StrokePoint[])[]): BufferGeometry => {
  const positions: number[] = [];
  const edges: number[] = [];
  const fades: number[] = [];
  const indices: number[] = [];
  for (const stroke of strokes) {
    const base = positions.length / 3;
    stroke.forEach((point, index) => {
      const before = stroke[Math.max(0, index - 1)] ?? point;
      const after = stroke[Math.min(stroke.length - 1, index + 1)] ?? point;
      const du = after.u - before.u;
      const dv = after.v - before.v;
      const length = Math.hypot(du, dv) || 1;
      const nu = -dv / length;
      const nv = du / length;
      for (const side of [-1, 1]) {
        positions.push(point.u + nu * point.halfWidth * side, point.v + nv * point.halfWidth * side, 0);
        edges.push(side);
        fades.push(point.alpha);
      }
      if (index > 0) {
        const a = base + (index - 1) * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("edge", new BufferAttribute(new Float32Array(edges), 1));
  geometry.setAttribute("fade", new BufferAttribute(new Float32Array(fades), 1));
  geometry.setIndex(indices);
  return geometry;
};

// The ribbon faces the camera: its u axis follows the travel direction as seen on screen (screen up when the
// travel points at the viewer), its v axis is perpendicular to it, both in view space.
const vertexShader = /* glsl */ `
  uniform vec3 travel;
  uniform float size;
  uniform float mirror;
  attribute float edge;
  attribute float fade;
  varying float vEdge;
  varying float vFade;
  void main() {
    vEdge = edge;
    vFade = fade;
    vec4 anchor = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float unit = length((modelViewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
    vec2 seen = (modelViewMatrix * vec4(travel, 0.0)).xy;
    float seenLength = length(seen);
    vec2 along = seenLength > 1e-4 * unit ? seen / seenLength : vec2(0.0, 1.0);
    vec2 across = vec2(-along.y, along.x);
    vec2 offset = (along * position.x + across * position.y * mirror) * size * unit;
    gl_Position = projectionMatrix * (anchor + vec4(offset, 0.0, 0.0));
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 color;
  uniform float opacity;
  uniform float softness;
  varying float vEdge;
  varying float vFade;
  void main() {
    float across = 1.0 - pow(abs(vEdge), softness);
    gl_FragColor = vec4(color, opacity * vFade * clamp(across, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

/** Edge falloff across a ribbon: crisp strokes for a swirl, soft wisps for vapour. */
const kindSoftness: Readonly<Record<EffectKind, number>> = { swirl: 6, vapour: 1.4 };

type Uniforms = Readonly<{
  travel: { value: Vector3 };
  size: { value: number };
  mirror: { value: number };
  color: { value: Color };
  opacity: { value: number };
  softness: { value: number };
}>;

// ---------------------------------------------------------------------------------------------
// Timing.

/** A stable 32-bit hash of an ID (FNV-1a): the effect's phase and mirror. */
const hashId = (id: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) hash = Math.imul(hash ^ id.charCodeAt(i), 0x01000193) >>> 0;
  return hash;
};

/** Stepped fade in and out over the first and last two frames of a run. */
const runOpacity = (tick: number): number => {
  const fromEnd = ticksPerRun - 1 - tick;
  const edge = Math.min(tick, fromEnd);
  return edge === 0 ? 0.4 : edge === 1 ? 0.75 : 1;
};

type Entry = {
  /** The authored effect from the house. */
  authored: AmbientEffectValue;
  /** Its live state (HA viewer), or null for the authored behaviour. */
  live: EffectLive | null;
  /** What is drawn: the authored effect with the live overrides, disabled while inactive. */
  value: AmbientEffectValue;
  readonly objectId: string;
  readonly phaseMs: number;
  readonly startFrame: number;
  readonly group: Group;
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  readonly uniforms: Uniforms;
  root: Object3D | null;
  previewStartMs: number | null;
  /** Anchor and travel in the object's frame (metres, glTF axes), from the last sync. */
  anchor: Vector3;
  travel: Vector3;
  shownKey: string;
};

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

/** The drawn effect: the authored one with the live overrides; an inactive effect is disabled. */
const liveValue = (authored: AmbientEffectValue, live: EffectLive | null): AmbientEffectValue => {
  if (live === null) return authored;
  const overrides = live.overrides ?? {};
  return {
    ...authored,
    enabled: authored.enabled && live.active,
    kind: overrides.kind ?? authored.kind,
    color: overrides.color ?? authored.color,
    direction: overrides.direction ?? authored.direction,
    sizeMm: overrides.sizeMm ?? authored.sizeMm,
  };
};

/** Whether two drawn effects look and run the same (the live part only). */
const sameLook = (a: AmbientEffectValue, b: AmbientEffectValue): boolean =>
  a.enabled === b.enabled &&
  a.kind === b.kind &&
  a.direction === b.direction &&
  a.sizeMm === b.sizeMm &&
  a.color.length === b.color.length &&
  a.color.every((channel, index) => channel === b.color[index]);

export const createEffectsLayer = (requestFrame: () => void): EffectsLayer => {
  const entries = new Map<string, Entry>();
  const frames = new Map<EffectKind, readonly BufferGeometry[]>();
  const boxes = new WeakMap<Object3D, Box3>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let shown = true;
  let paused = false;
  let syncedFloorId: string | null = null;
  let liveStates: ReadonlyMap<string, EffectLive> = new Map();
  const media = typeof window === "undefined" ? null : window.matchMedia(reducedMotionQuery);
  let reducedMotion = media?.matches ?? false;

  const framesOf = (kind: EffectKind): readonly BufferGeometry[] => {
    const cached = frames.get(kind);
    if (cached !== undefined) return cached;
    const built = Array.from({ length: frameCount }, (_, frame) =>
      ribbonGeometry(kind === "swirl" ? swirlStrokes(frame) : vapourStrokes(frame)),
    );
    frames.set(kind, built);
    return built;
  };

  /** The object's model box in its own frame (metres), cached per built model. */
  const modelBox = (root: Object3D): Box3 => {
    const cached = boxes.get(root);
    if (cached !== undefined) return cached;
    const box = new Box3();
    root.traverse((child) => {
      if (!isMesh(child) || child === root) return;
      const geometry = child.geometry;
      if (geometry.boundingBox === null) geometry.computeBoundingBox();
      const local = geometry.boundingBox;
      if (local === null) return;
      const toRoot = new Matrix4();
      let node: Object3D | null = child;
      while (node !== null && node !== root) {
        if (node.matrixAutoUpdate) node.updateMatrix();
        toRoot.premultiply(node.matrix);
        node = node.parent;
      }
      box.union(local.clone().applyMatrix4(toRoot));
    });
    if (box.isEmpty()) box.set(new Vector3(-0.2, 0, 0), new Vector3(0.2, 0.4, 0.4));
    boxes.set(root, box);
    return box;
  };

  /** The middle of the box's top (up) or front (forward) face, moved by the offset (object axes). */
  const placeEntry = (entry: Entry): void => {
    const { value, root } = entry;
    if (root === null) return;
    const box = modelBox(root);
    const center = box.getCenter(new Vector3());
    const offset = new Vector3(value.offsetMm.x, value.offsetMm.h, value.offsetMm.y).multiplyScalar(0.001);
    entry.anchor =
      value.direction === "up"
        ? new Vector3(center.x, box.max.y, center.z).add(offset)
        : new Vector3(center.x, center.y, box.max.z).add(offset);
    entry.travel = value.direction === "up" ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1);
    const { uniforms } = entry;
    uniforms.travel.value.copy(entry.travel);
    uniforms.size.value = value.sizeMm / 1000;
    uniforms.color.value.setRGB(...rgbShare(value.color), SRGBColorSpace);
    uniforms.softness.value = kindSoftness[value.kind];
    entry.shownKey = "";
  };

  const rgbShare = (rgb: readonly number[]): [number, number, number] => [
    (rgb[0] ?? 0) / 255,
    (rgb[1] ?? 0) / 255,
    (rgb[2] ?? 0) / 255,
  ];

  /** Milliseconds into the effect's current run, or null between runs. */
  const runElapsed = (entry: Entry, now: number): number | null => {
    if (entry.previewStartMs !== null) {
      const elapsed = now - entry.previewStartMs;
      if (elapsed >= 0 && elapsed < effectRunMs) return elapsed;
      entry.previewStartMs = null;
    }
    const cycle = (now + entry.phaseMs) % effectPeriodMs;
    return cycle < effectRunMs ? cycle : null;
  };

  /** Applies each effect's frame for `now`; true when anything drawn changed. */
  const update = (now: number): boolean => {
    let changed = false;
    for (const entry of entries.values()) {
      const { value, mesh } = entry;
      let key = "off";
      if (value.enabled && entry.root !== null) {
        if (reducedMotion) key = `still:${String(stillFrame)}`;
        else {
          const elapsed = runElapsed(entry, now);
          if (elapsed !== null)
            key = `run:${String(Math.min(ticksPerRun - 1, Math.floor(elapsed / tickMs)))}`;
        }
      }
      if (key === entry.shownKey) continue;
      entry.shownKey = key;
      changed = true;
      if (key === "off") {
        mesh.visible = false;
        continue;
      }
      const tick = key.startsWith("run:") ? Number(key.slice(4)) : -1;
      const frame = tick < 0 ? stillFrame : (tick + entry.startFrame) % frameCount;
      const geometry = framesOf(value.kind)[frame];
      if (geometry !== undefined) mesh.geometry = geometry;
      const drift = tick < 0 ? 0.15 : (tick / (ticksPerRun - 1)) * driftShare;
      mesh.position.copy(entry.anchor).addScaledVector(entry.travel, (drift * value.sizeMm) / 1000);
      mesh.updateMatrix();
      entry.uniforms.opacity.value = tick < 0 ? 0.9 : runOpacity(tick);
      mesh.visible = true;
    }
    return changed;
  };

  /** When the running timer fires (ms, performance.now()), or +∞ when none runs. */
  let timerDue = Number.POSITIVE_INFINITY;

  const stopTimer = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    timerDue = Number.POSITIVE_INFINITY;
  };

  /**
   * Keeps the timer on the next tick. Idempotent (Phase 15.3): a timer already due no later than the next tick is
   * kept. Before, every call restarted it, and the HA viewer calls `setShown` twice per rendered frame (the glass
   * reflection hides the effects), so while frames ran continuously (an orbit, a camera spring, a door animation)
   * the timer was pushed past each tick: at 120 Hz it never fired and a running effect stood still on one frame.
   */
  const schedule = (): void => {
    // Paused (hidden) effects request no frames at all (owner: no redraws without need).
    if (disposed || reducedMotion || !shown || paused) {
      stopTimer();
      return;
    }
    const now = performance.now();
    let wait = Number.POSITIVE_INFINITY;
    for (const entry of entries.values()) {
      if (!entry.value.enabled || entry.root === null) continue;
      const elapsed = runElapsed(entry, now);
      wait = Math.min(
        wait,
        elapsed !== null
          ? tickMs - (elapsed % tickMs)
          : effectPeriodMs - ((now + entry.phaseMs) % effectPeriodMs),
      );
    }
    if (!Number.isFinite(wait)) {
      stopTimer();
      return;
    }
    const delay = Math.max(10, wait + 2);
    if (timer !== null && timerDue <= now + delay + 1) return;
    stopTimer();
    timerDue = now + delay;
    timer = setTimeout(tick, delay);
  };

  const tick = (): void => {
    timer = null;
    timerDue = Number.POSITIVE_INFINITY;
    if (disposed || !shown || paused) return;
    if (update(performance.now())) requestFrame();
    schedule();
  };

  const onMotionChange = (event: MediaQueryListEvent): void => {
    reducedMotion = event.matches;
    for (const entry of entries.values()) entry.shownKey = "";
    tick();
  };
  media?.addEventListener("change", onMotionChange);

  const removeEntry = (entry: Entry): void => {
    entry.group.removeFromParent();
    entry.mesh.material.dispose();
  };

  const createEntry = (authored: AmbientEffectValue, objectId: string): Entry => {
    const live = liveStates.get(authored.id) ?? null;
    const value = liveValue(authored, live);
    const hash = hashId(value.id);
    const uniforms: Uniforms = {
      travel: { value: new Vector3(0, 1, 0) },
      size: { value: 0.6 },
      mirror: { value: (hash & 1) === 0 ? 1 : -1 },
      color: { value: new Color() },
      opacity: { value: 1 },
      softness: { value: kindSoftness[value.kind] },
    };
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: true,
      // Both faces: a mirrored drawing (odd ID hash) reverses the triangles' winding, and front-face culling then
      // dropped the whole effect (owner report 2026-11-16: "I cannot see the swirl").
      side: DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new Mesh<BufferGeometry, ShaderMaterial>(
      framesOf(value.kind)[0] ?? new BufferGeometry(),
      material,
    );
    mesh.name = `effect:${value.id}`;
    // The shader moves the vertices on screen: the CPU bounds would cull it wrongly.
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    mesh.renderOrder = 10;
    mesh.layers.set(effectsLayer);
    const group = new Group();
    group.name = `effects:${objectId}`;
    group.matrixAutoUpdate = false;
    group.layers.set(effectsLayer);
    group.add(mesh);
    return {
      authored,
      live,
      value,
      objectId,
      phaseMs: hash % effectPeriodMs,
      startFrame: (hash >>> 8) % frameCount,
      group,
      mesh,
      uniforms,
      root: null,
      previewStartMs: null,
      anchor: new Vector3(),
      travel: new Vector3(0, 1, 0),
      shownKey: "",
    };
  };

  /** Follows the object's model: same parent, same matrix, hidden with it. */
  const follow = (entry: Entry): void => {
    const root = entry.root;
    const parent = root?.parent ?? null;
    if (root === null || parent === null) {
      entry.group.removeFromParent();
      return;
    }
    if (entry.group.parent !== parent) parent.add(entry.group);
    if (!entry.group.matrix.equals(root.matrix)) {
      entry.group.matrix.copy(root.matrix);
      entry.group.matrixWorldNeedsUpdate = true;
    }
    entry.group.visible = shown && root.visible;
  };

  return {
    sync: (floor, instanceRoot) => {
      if (disposed) return;
      // Effects that appear or change after the floor's first sync are edits: they play once (preview).
      const editing = floor !== null && floor.id === syncedFloorId;
      syncedFloorId = floor?.id ?? null;
      const now = performance.now();
      const seen = new Set<string>();
      for (const area of floor?.areas ?? []) {
        for (const object of area.objects) {
          for (const value of object.effects ?? []) {
            seen.add(value.id);
            let entry = entries.get(value.id);
            const changed = entry?.authored !== value;
            if (entry === undefined) {
              entry = createEntry(value, object.id);
              entries.set(value.id, entry);
            }
            entry.authored = value;
            entry.value = liveValue(value, entry.live);
            const root = instanceRoot(object.id);
            if (root !== entry.root || changed) {
              entry.root = root;
              placeEntry(entry);
            }
            if (changed && editing) entry.previewStartMs = now;
            follow(entry);
          }
        }
      }
      for (const [id, entry] of entries) {
        if (seen.has(id)) continue;
        removeEntry(entry);
        entries.delete(id);
      }
      update(now);
      schedule();
    },
    beforeRender: () => {
      for (const entry of entries.values()) follow(entry);
    },
    preview: (ids) => {
      if (disposed || !shown || ids.length === 0) return;
      const wanted = new Set(ids);
      const now = performance.now();
      let any = false;
      for (const entry of entries.values()) {
        if (!wanted.has(entry.value.id) && !wanted.has(entry.objectId)) continue;
        entry.previewStartMs = now;
        any = true;
      }
      if (!any) return;
      if (update(now)) requestFrame();
      schedule();
    },
    playAll: () => {
      if (disposed) return;
      const now = performance.now();
      for (const entry of entries.values()) entry.previewStartMs = now;
      if (update(now)) requestFrame();
      schedule();
    },
    setLive: (states) => {
      if (disposed) return;
      liveStates = states;
      const now = performance.now();
      let any = false;
      for (const entry of entries.values()) {
        const live = states.get(entry.authored.id) ?? null;
        if (live === entry.live) continue;
        entry.live = live;
        const next = liveValue(entry.authored, live);
        const previous = entry.value;
        entry.value = next;
        if (sameLook(previous, next)) continue;
        any = true;
        // The kind, colour, direction, or size may have changed: re-place and redraw it.
        placeEntry(entry);
        // Activation or a new look while active plays at once (K1, K2); deactivation drops a running preview.
        entry.previewStartMs = next.enabled ? now : null;
      }
      if (!any) return;
      if (update(now)) requestFrame();
      schedule();
    },
    setShown: (next) => {
      if (next === shown) return;
      shown = next;
      for (const entry of entries.values()) follow(entry);
      // Hiding keeps the timer: the reflection pass hides the effects for a moment inside every frame (15.3). A tick
      // that finds them hidden stops it (schedule), so a lasting hide still requests no frames.
      if (shown) schedule();
    },
    setPaused: (next) => {
      if (next === paused) return;
      paused = next;
      if (paused) stopTimer();
      else tick();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      stopTimer();
      media?.removeEventListener("change", onMotionChange);
      for (const entry of entries.values()) removeEntry(entry);
      entries.clear();
      for (const list of frames.values()) for (const geometry of list) geometry.dispose();
      frames.clear();
    },
  };
};
