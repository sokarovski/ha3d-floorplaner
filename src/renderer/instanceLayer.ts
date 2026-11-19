// Template instances of the active floor: Wallable openings (doors, windows), Areable objects (stairs and floor
// openings included, Phase 16.14), and visible light fixtures. Each instance is resized by the geometry core
// (templateResize, contact frame in meters) and placed by one matrix from the contact frame into the
// floor frame (mm) inside its area's group.
//
// Placement conventions (documented for the editor):
// - Contact frame → plan: template +x = the object's right, +y = up (h), +z = front. An Areable
//   with rotation 0 faces plan −y; rotation turns it counterclockwise (area rotation + instance rotation).
// - Wallable: center at distanceAlongWallMm from the wall's span start on the source edge, y = 0 at bottomMm,
//   z = 0 at the center of the merged wall stack at the opening (mergedDepthAt over RealAllWalls bands),
//   +z toward the host area. hostDepthMm is that merged depth (the wall's own thickness when alone).
// - Areable on the floor: bottom contact at positionMm (area-relative) and elevationMm.
// - Areable on a wall: back contact on the attachment wall's hostSide face (default from the template, else
//   interior), positionMm.x along the wall from its span start, elevationMm above the floor; front = face normal.
// - Areable overhead: top contact at (overhead reference − elevationMm), the reference being the area's highest
//   wall (2500 mm without walls). Light fixtures: contact at the light's position and elevation, heading as the
//   light; fixtures with a `back` contact (linear strips) are mounted face down, their length following the
//   light's lengthMm through the template's x size parameter. Fixture meshes cast no shadows. A wall-mounted
//   point or spot light (Phase 17.3, `mount: "wall"`, shared/domain/lighting/wallMount.ts) is placed like a
//   wall-hosted object instead: back contact on its wall's chosen face (interior or exterior) at the light's
//   projected position and elevation, front = the face's normal.
// - Fixture emitters (Phase 8.9, K15): the template's KHR_lights_punctual node, else its linear emitter node,
//   else (no emitter node) the centre of the model face opposite its contact (an overhead fixture's bottom).
//   A spot light, and a point light in an overhead fixture whose opening is narrower than its depth (a tube
//   downlight), then moves along its aim (straight down for a point light) to 10 mm outside the model's
//   bounds, at most 250 mm: deep in a tube it lit the tube's inside to a white disc, since the fixture's own
//   meshes cast no shadows. A wide shade (pendant) keeps its bulb inside.
// - Fixture glow (Phase 8.9): every emissive glTF material of a fixture gets a per-fixture copy whose emissive
//   colour is the light's colour and whose strength is the template's (at most 3) × the light's brightness,
//   0 when the light is off (`setFixtureGlow`).
// - Material slot overrides use box-projected UVs in mm (dominant normal axis, after resizing) so surface
//   materials tile at physical size; other meshes keep their glTF materials and authored UVs. A preset choice
//   (`{ preset }`, Phase 9.1) draws the slot with that bundled glTF material and its authored UVs.
// - Mirror templates (`mirror`, Phase 9.1) draw their mirror slot with a shared environment-map reflection
//   (mirrorSurface.ts) unless the instance overrides it with its own surface material.
// - Display templates (`screen`, Phase 8.8) report their screen slot's box (`screen`) for the screen layer.
// - Missing or failed templates render a grey placeholder box of the instance's size (warning logged once).
// - Yard fences (Phase 17.2, shared/geometry/yardFences.ts): every fence segment of a yard is an instance of the
//   yard's fence template, bottom contact at the segment's centre on the band's middle line, front into the yard,
//   sized by its length (x) and the wall height (y). It is the wall in the view: it hides with Walls off and a
//   pick on it is a pick on its wall. A gate (a door on a yard wall) is placed like any opening but on the
//   wall's own depth: yard walls are not part of RealAllWalls and merge with nothing.
import type { FadeLevel } from "./surfaceMaterialKey";
import { opacityOfFade } from "./surfaceMaterialKey";
import type { Material, Object3D, BufferGeometry } from "three";
import { BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Box3, Vector3 } from "three";
import { linearFacingDeg } from "@shared/domain/lighting/linearFacing";
import type { LightValue } from "@shared/domain/schemas/light";
import type { FixtureGlow } from "./lightColor";
import type { AreaValue } from "@shared/domain/schemas/area";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import { isMaterialPresetChoice } from "@shared/domain/schemas/values";
import type { MaterialOverrideValue, SurfaceMaterialValue } from "@shared/domain/schemas/values";
import type { TemplateParameterValue } from "@shared/domain/templates/metadata";
import {
  axisSizeParameter,
  defaultInstanceParameters,
  templateMaterialSlots,
} from "@shared/domain/templates/metadata";
import { applyAffine } from "@shared/geometry/affine";
import { areaToFloorAffine } from "@shared/geometry/placement";
import { buildRealAllWalls } from "@shared/geometry/realAllWalls";
import type { OpeningSizeResolver, RealAllWalls } from "@shared/geometry/realAllWallsTypes";
import { templateResize } from "@shared/geometry/templateResize";
import type { SkyGlassPane, SkyOpening, SkyOpenings } from "./skyTypes";
import type { ResizedMesh, TemplatePoseWeight, TemplateResizeResult } from "@shared/geometry/templateResize";
import type { Vec2 } from "@shared/geometry/vector";
import { mergedDepthAt } from "@shared/geometry/wallOpenings";
import { realWallInFloor, wallFacePlane } from "@shared/geometry/wallFaces";
import { lightFloorPoint, lightWallMount } from "@shared/domain/lighting/wallMount";
import { yardFenceSegments } from "@shared/geometry/yardFences";
import { isYard } from "@shared/domain/house/yards";
import type { MaterialCache } from "./materialCache";
import type { MirrorSurfaces } from "./mirrorSurface";
import type { PickResolver, PickTargets } from "./pickables";
import { worldToPlan } from "./planFrame";
import type { PlanPoint3 } from "./runtimeTypes";
import { detachAndDisposeGeometries } from "./sceneObjects";
import { glassTransmission, seeThrough } from "./shadowCasting";
import { resizedGeometry } from "./templateGeometry";
import type { TemplateAsset, TemplateCache } from "./templateCache";

export type { SkyGlassPane, SkyOpening, SkyOpenings };
export type InstanceLayer = Readonly<{
  /** Returns floor-frame emitter positions of light fixtures whose template is rendered. */
  sync: (
    floor: BuildingFloorValue | null,
    openingSize: OpeningSizeResolver,
    /** The group an instance attaches to, by its area and its entity (object, opening, light) ID. */
    groupOf: (areaId: string, entityId: string) => Group | null,
  ) => ReadonlyMap<string, PlanPoint3>;
  /**
   * Assigns materials; call between MaterialCache.begin() and sweep(). `fadeOf` gets the area and the entity
   * (object, opening, or light ID), so a ghosted entity (Show hidden, Phase 7.5) can fade alone.
   */
  applyMaterials: (fadeOf: (areaId: string, entityId: string) => FadeLevel) => void;
  pickTargets: () => PickTargets;
  /**
   * Walls off (Phase 4.5; owner 2026-11-17): openings (Wallable doors and windows, which cut the wall) hide
   * with their walls; wall-attached Areable objects stay drawn and pickable in place.
   */
  setWallOpeningsVisible: (visible: boolean) => void;
  /**
   * An instance's box (owner, Phase 5 follow-up): the 8 corners of its model's bounds in its own axes, in
   * floor plan mm (x, y, h); null until the model is built. Corner order: bottom 4 then top 4.
   */
  bounds: (instanceId: string) => readonly PlanPoint3[] | null;
  /** Light controls Off (owner, Phase 5 follow-up): light fixture models are not drawn or picked. */
  setLightFixturesVisible: (visible: boolean) => void;
  /** Hidden lights (Phase 7.5): their fixture models are not drawn or picked; their emitters still shine. */
  setConcealedLights: (lightIds: ReadonlySet<string>) => void;
  /** An instance's placed model group (contact frame, metres), or null before it is built (effects, D24). */
  root: (instanceId: string) => Object3D | null;
  /** The screen of a display instance (template `screen`, Phase 8.8) in its root's frame, or null. */
  screen: (instanceId: string) => ScreenFace | null;
  /** Fixture glow by light ID (`LightsLayer.fixtureGlow`); a fixture without an entry keeps its template glow. */
  setFixtureGlow: (glow: ReadonlyMap<string, FixtureGlow>) => void;
  /**
   * Pose blends by instance ID (Phase 10.2, stateAnimation.ts): an instance in the map is drawn with its pose
   * rules blended over the weighted parameter sets; one that left the map is drawn at its own parameters again.
   * Built instances re-pose at once (new geometry in the same meshes, so materials stay); later builds use the
   * stored blend. Returns true when an instance had to be rebuilt because a part's visibility changed (the
   * caller then syncs again and reapplies materials). Emitters and screens keep their place.
   */
  setPoses: (poses: ReadonlyMap<string, readonly TemplatePoseWeight[]>) => boolean;
  /**
   * Phase 15.5 sky portals (skyShading.ts): every built Wallable opening with clear glass. Same object until an
   * instance is synced or re-posed.
   */
  skyOpenings: () => SkyOpenings;
  dispose: () => void;
}>;

/** A screen's box in its instance root's contact frame (metres) and the side its picture faces (±z). */
export type ScreenFace = Readonly<{
  min: readonly [number, number, number];
  max: readonly [number, number, number];
  front: 1 | -1;
}>;

type Contact = "wallable" | "back" | "bottom" | "top";

type Placement = Readonly<{
  /** Contact point, floor mm. */
  origin: PlanPoint3;
  /** Unit plan direction of the template front (+z), horizontal. */
  front: Vec2;
  /** Face-down mounting (template front = −h, right = heading) for back-contact light fixtures. */
  faceDown?: boolean;
  /** A face-down fixture's facing (Phase 13.3): its front turned about the heading from straight down. */
  facingDeg?: number;
  hostDepthMm: number | undefined;
}>;

type Subject = Readonly<{
  id: string;
  areaId: string;
  wallId?: string;
  /** A yard fence segment (Phase 17.2): the wall it draws; picks resolve to that wall. */
  fenceWallId?: string;
  lightId?: string;
  templateId: string;
  templateVersion: number;
  source: object;
  parameters: Readonly<Record<string, TemplateParameterValue>>;
  flip: Readonly<{ x: boolean; z: boolean }>;
  overrides: Readonly<Record<string, MaterialOverrideValue>>;
  contact: Contact;
  /** Linear light fixtures: the strip length drives the template's x size parameter. */
  lightLengthMm?: number;
  /** Light fixtures: the light's aim (unit, floor frame) and whether it always moves to the fixture's mouth. */
  lightAim?: Readonly<{ direction: PlanPoint3; spot: boolean }>;
  placement: Placement | null;
}>;

type MeshSlot = Readonly<{
  mesh: Mesh;
  base: Material | null;
  override: SurfaceMaterialValue | null;
  /** The resized mesh it was built from (node, copy, material, vertex count), for in-place re-posing. */
  part?: string;
}>;

const partKey = (mesh: ResizedMesh): string =>
  `${mesh.nodeName}#${String(mesh.copyIndex)}#${mesh.materialName ?? ""}#${String(mesh.positions.length)}`;

/** A fixture's emissive material copy and the template's emissive it started from. */
type GlowSlot = Readonly<{
  material: MeshStandardMaterial;
  color: readonly [number, number, number];
  intensity: number;
}>;

type Entry = {
  readonly subject: Subject;
  readonly asset: TemplateAsset | null;
  readonly hostDepthMm: number | undefined;
  readonly root: Group;
  readonly slots: readonly MeshSlot[];
  /** Emitter position in the contact frame (meters). */
  readonly emitterLocal: readonly [number, number, number] | null;
  readonly screen: ScreenFace | null;
  /** The built model's bounds in the contact frame (meters), or null without meshes. */
  readonly boundsLocal: Box3 | null;
  readonly glows: readonly GlowSlot[];
};

/** Strongest template glow a fixture keeps (emissive strength at full brightness). */
const fixtureGlowCap = 3;
/** How far beyond the fixture's bounds a moved emitter sits, and how far it may move (meters). */
const mouthClearanceM = 0.01;
const mouthTravelMaxM = 0.25;

/** The light's aim in the floor frame: a spot's tilt and heading, straight down otherwise. */
const lightAimOf = (area: AreaValue, light: LightValue): PlanPoint3 => {
  if (light.geometry.type !== "spot") return { x: 0, y: 0, h: -1 };
  const tilt = (light.spot.tiltDeg * Math.PI) / 180;
  const heading = ((area.rotationDeg + light.rotationDeg) * Math.PI) / 180;
  return {
    x: Math.sin(tilt) * Math.cos(heading),
    y: Math.sin(tilt) * Math.sin(heading),
    h: -Math.cos(tilt),
  };
};

/** Without an emitter node: the centre of the bounds face opposite the template's contact, just outside. */
const fallbackEmitter = (bounds: Box3, contact: string): readonly [number, number, number] => {
  const center = bounds.getCenter(new Vector3());
  if (contact === "top") return [center.x, bounds.min.y - mouthClearanceM, center.z];
  if (contact === "bottom") return [center.x, bounds.max.y + mouthClearanceM, center.z];
  if (contact === "back") return [center.x, center.y, bounds.max.z + mouthClearanceM];
  return [center.x, center.y, center.z];
};

/**
 * The emitter at the fixture's mouth (see the header): from `local`, along the aim to just outside the bounds,
 * for spots always, for overhead point lights only when the opening (the smaller half-size across the aim) is
 * narrower than the depth to the mouth.
 */
const mouthEmitter = (
  local: readonly [number, number, number],
  bounds: Box3,
  matrix: Matrix4,
  aim: Readonly<{ direction: PlanPoint3; spot: boolean }>,
): readonly [number, number, number] => {
  const point = new Vector3(local[0], local[1], local[2]);
  if (!bounds.containsPoint(point)) return local;
  const direction = new Vector3(aim.direction.x, aim.direction.y, aim.direction.h).transformDirection(
    matrix.clone().invert(),
  );
  const axes = [direction.x, direction.y, direction.z];
  const low = [bounds.min.x, bounds.min.y, bounds.min.z];
  const high = [bounds.max.x, bounds.max.y, bounds.max.z];
  const start = [point.x, point.y, point.z];
  let depth = Infinity;
  let dominant = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const d = axes[axis] ?? 0;
    if (Math.abs(d) > Math.abs(axes[dominant] ?? 0)) dominant = axis;
    if (Math.abs(d) < 1e-9) continue;
    const edge = d > 0 ? (high[axis] ?? 0) : (low[axis] ?? 0);
    depth = Math.min(depth, (edge - (start[axis] ?? 0)) / d);
  }
  if (!Number.isFinite(depth) || depth < 0) return local;
  if (!aim.spot) {
    const across = [0, 1, 2]
      .filter((axis) => axis !== dominant)
      .map((axis) => ((high[axis] ?? 0) - (low[axis] ?? 0)) / 2);
    if (Math.min(...across) >= depth) return local;
  }
  point.addScaledVector(direction, Math.min(depth + mouthClearanceM, mouthTravelMaxM));
  return [point.x, point.y, point.z];
};

const isGlowing = (material: Material | null): material is MeshStandardMaterial =>
  material instanceof MeshStandardMaterial &&
  material.emissiveIntensity > 0 &&
  Math.max(material.emissive.r, material.emissive.g, material.emissive.b) > 0;

const applyGlow = (slot: GlowSlot, glow: FixtureGlow, faded: readonly Material[]): void => {
  const strength = Math.max(...slot.color);
  for (const material of [slot.material, ...faded]) {
    if (!(material instanceof MeshStandardMaterial)) continue;
    material.emissive.copy(glow.color).multiplyScalar(strength);
    material.emissiveIntensity = Math.min(slot.intensity, fixtureGlowCap) * glow.level;
  }
};

const defaultOverheadMm = 2500;

const headingFront = (degrees: number): Vec2 => {
  const radians = (degrees * Math.PI) / 180;
  return { x: Math.sin(radians), y: -Math.cos(radians) };
};

/** Contact frame (meters, glTF axes) → floor plan frame (mm). */
const contactMatrix = (placement: Placement): Matrix4 => {
  const o = placement.origin;
  const f = placement.front;
  if (placement.faceDown === true) {
    // right = heading direction, front = the facing (down at 0°, linearFacing.ts), up = front × right
    // (right-handed). At 0°: front (0, 0, −1), up (r.y, −r.x, 0).
    const r = { x: -f.y, y: f.x };
    const facing = ((placement.facingDeg ?? 0) * Math.PI) / 180;
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    return new Matrix4().set(
      r.x * 1000,
      r.y * cos * 1000,
      -r.y * sin * 1000,
      o.x,
      r.y * 1000,
      -r.x * cos * 1000,
      r.x * sin * 1000,
      o.y,
      0,
      -sin * 1000,
      -cos * 1000,
      o.h,
      0,
      0,
      0,
      1,
    );
  }
  const r = { x: -f.y, y: f.x };
  return new Matrix4().set(
    r.x * 1000,
    0,
    f.x * 1000,
    o.x,
    r.y * 1000,
    0,
    f.y * 1000,
    o.y,
    0,
    1000,
    0,
    o.h,
    0,
    0,
    0,
    1,
  );
};

const transformPoint = (matrix: Matrix4, point: readonly [number, number, number]): PlanPoint3 => {
  const e = matrix.elements;
  const [x, y, z] = point;
  return {
    x: e[0] * x + e[4] * y + e[8] * z + e[12],
    y: e[1] * x + e[5] * y + e[9] * z + e[13],
    h: e[2] * x + e[6] * y + e[10] * z + e[14],
  };
};

const numberParameter = (
  parameters: Readonly<Record<string, TemplateParameterValue>>,
  name: string,
  fallback: number,
): number => {
  const value = parameters[name];
  return typeof value === "number" && value > 0 ? value : fallback;
};

/** Placeholder box in the contact frame (meters). */
const placeholderGeometry = (subject: Subject, hostDepthMm: number | undefined): BufferGeometry => {
  const width = numberParameter(subject.parameters, "widthMm", 600) / 1000;
  const height = numberParameter(subject.parameters, "heightMm", 600) / 1000;
  const depth =
    (subject.contact === "wallable"
      ? (hostDepthMm ?? 200)
      : numberParameter(subject.parameters, "depthMm", 600)) / 1000;
  const geometry = new BoxGeometry(width, height, depth);
  const y = subject.contact === "top" ? -height / 2 : height / 2;
  const z = subject.contact === "back" ? depth / 2 : 0;
  geometry.translate(0, y, z);
  return geometry;
};

const clampTo = (value: number, resize: Readonly<{ minMm?: number; maxMm?: number }>): number =>
  Math.min(resize.maxMm ?? Number.POSITIVE_INFINITY, Math.max(resize.minMm ?? 0, value));

/** A fence segment's width and height clamped to its template's x and y limits (Phase 17.2). */
const fenceParameters = (
  parameters: Readonly<Record<string, TemplateParameterValue>>,
  asset: TemplateAsset,
): Readonly<Record<string, TemplateParameterValue>> => {
  const { x, y } = asset.metadata.resize;
  return {
    ...parameters,
    widthMm: clampTo(numberParameter(parameters, "widthMm", x.defaultMm ?? 1000), x),
    heightMm: clampTo(numberParameter(parameters, "heightMm", y.defaultMm ?? 1000), y),
  };
};

const overheadReferenceMm = (area: AreaValue): number =>
  area.walls.length === 0 ? defaultOverheadMm : Math.max(...area.walls.map((wall) => wall.heightMm));

export const createInstanceLayer = (
  templates: TemplateCache,
  materials: MaterialCache,
  mirrors: MirrorSurfaces,
): InstanceLayer => {
  const entries = new Map<string, Entry>();
  const fadedClones = new Map<FadeLevel, Map<Material, Material>>();
  const placeholderMaterial = new MeshStandardMaterial({
    color: 0x9aa3ad,
    roughness: 0.8,
    transparent: true,
    opacity: 0.7,
  });
  const fallbackMaterial = new MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.7 });
  const warned = new Set<string>();

  let fixtureGlow: ReadonlyMap<string, FixtureGlow> = new Map();
  let poses: ReadonlyMap<string, readonly TemplatePoseWeight[]> = new Map();
  /** Bumped on every sync and re-pose (skyOpenings). */
  let skyVersion = 0;
  let skyCache: SkyOpenings = { version: -1, openings: [] };

  const skyOpeningOf = (entry: Entry): SkyOpening | null => {
    const { subject, asset } = entry;
    if (subject.contact !== "wallable" || asset === null) return null;
    const panes: SkyGlassPane[] = [];
    for (const slot of entry.slots) {
      if (slot.override !== null || !seeThrough(slot.base)) continue;
      const transmission = glassTransmission(slot.base);
      if (transmission <= 0) continue;
      slot.mesh.geometry.computeBoundingBox();
      const box = slot.mesh.geometry.boundingBox;
      if (box === null || box.isEmpty()) continue;
      panes.push({ min: box.min.toArray(), max: box.max.toArray(), transmission });
    }
    if (panes.length === 0) return null;
    const defaults = defaultInstanceParameters(asset.metadata);
    const sets = poses.get(subject.id) ?? [{ parameters: subject.parameters, weight: 1 }];
    return {
      id: subject.id,
      areaId: subject.areaId,
      root: entry.root,
      panes,
      parameterSets: sets.map((set) => ({
        parameters: { ...defaults, ...set.parameters },
        weight: set.weight,
      })),
    };
  };

  const fadedOf = (material: Material): Material[] =>
    [...fadedClones.values()].flatMap((clones) => {
      const clone = clones.get(material);
      return clone === undefined ? [] : [clone];
    });

  const removeEntry = (entry: Entry): void => {
    detachAndDisposeGeometries(entry.root);
    for (const slot of entry.glows) {
      for (const clones of fadedClones.values()) {
        clones.get(slot.material)?.dispose();
        clones.delete(slot.material);
      }
      slot.material.dispose();
    }
  };

  const glowEntry = (entry: Entry): void => {
    const lightId = entry.subject.lightId;
    const glow = lightId === undefined ? undefined : fixtureGlow.get(lightId);
    if (glow === undefined) return;
    for (const slot of entry.glows) applyGlow(slot, glow, fadedOf(slot.material));
  };

  /** One source object per fence segment while its template and size stay the same (rebuilt otherwise). */
  const fenceSources = new Map<string, Readonly<{ key: string; source: object }>>();
  const fenceSource = (id: string, key: string): object => {
    const known = fenceSources.get(id);
    if (known?.key === key) return known.source;
    const source = { key };
    fenceSources.set(id, { key, source });
    return source;
  };

  const subjectsOf = (area: AreaValue, walls: RealAllWalls): Subject[] => {
    const subjects: Subject[] = [];
    const toFloor = areaToFloorAffine(area);
    for (const segment of yardFenceSegments(area)) {
      const parameters = { widthMm: segment.widthMm, heightMm: segment.heightMm };
      subjects.push({
        id: segment.id,
        areaId: area.id,
        fenceWallId: segment.wallId,
        templateId: segment.templateId,
        templateVersion: segment.templateVersion,
        source: fenceSource(
          segment.id,
          `${segment.templateId}@${String(segment.templateVersion)}|${String(segment.widthMm)}|${String(segment.heightMm)}`,
        ),
        parameters,
        flip: { x: false, z: false },
        overrides: {},
        contact: "wallable",
        placement: {
          origin: { ...segment.center, h: 0 },
          front: segment.front,
          hostDepthMm: undefined,
        },
      });
    }
    const yard = isYard(area);
    for (const wall of area.walls) {
      const realWall = realWallInFloor(area, wall.id);
      for (const opening of wall.objects) {
        let placement: Placement | null = null;
        // Openings on curved walls are deferred (D20): none are placed on an arc wall.
        if (realWall !== null && realWall.arc === null) {
          const along = realWall.spanMm.fromMm + opening.placement.distanceAlongWallMm;
          const half = numberParameter(opening.parameters, "widthMm", 1000) / 2;
          const depth = mergedDepthAt(realWall, along - half, along + half, yard ? [] : walls.bands);
          const center = (depth.lo + depth.hi) / 2;
          const edge = realWall.edge;
          placement = {
            origin: {
              x: edge.start.x + edge.direction.x * along + edge.outwardNormal.x * center,
              y: edge.start.y + edge.direction.y * along + edge.outwardNormal.y * center,
              h: opening.placement.bottomMm,
            },
            front: { x: -edge.outwardNormal.x, y: -edge.outwardNormal.y },
            hostDepthMm: depth.hi - depth.lo,
          };
        }
        subjects.push({
          id: opening.id,
          areaId: area.id,
          wallId: wall.id,
          templateId: opening.templateId,
          templateVersion: opening.templateVersion,
          source: opening,
          parameters: opening.parameters,
          flip: opening.flip,
          overrides: opening.materialOverrides,
          contact: "wallable",
          placement,
        });
      }
    }
    for (const object of area.objects) {
      const host = object.attachment.host;
      let placement: Placement;
      let wallId: string | undefined;
      const realWall =
        host === "wall" && object.attachment.wallId !== undefined
          ? realWallInFloor(area, object.attachment.wallId)
          : null;
      if (realWall !== null) {
        wallId = realWall.wallId;
        const asset = templates.get(object.templateId, object.templateVersion);
        const side =
          object.attachment.hostSide ??
          (asset.state === "ready" ? asset.asset.metadata.attachment.defaultHostSide : undefined) ??
          "interior";
        const plane = wallFacePlane(realWall, side);
        const along = realWall.spanMm.fromMm + object.positionMm.x;
        placement = {
          origin: {
            x: plane.point.x + plane.direction.x * along,
            y: plane.point.y + plane.direction.y * along,
            h: object.elevationMm,
          },
          front: plane.normal,
          hostDepthMm: undefined,
        };
      } else {
        const point = applyAffine(toFloor, object.positionMm);
        const h = host === "overhead" ? overheadReferenceMm(area) - object.elevationMm : object.elevationMm;
        placement = {
          origin: { ...point, h },
          front: headingFront(area.rotationDeg + object.rotationDeg),
          hostDepthMm: undefined,
        };
      }
      subjects.push({
        id: object.id,
        areaId: area.id,
        ...(wallId === undefined ? {} : { wallId }),
        templateId: object.templateId,
        templateVersion: object.templateVersion,
        source: object,
        parameters: object.parameters,
        flip: object.flip,
        overrides: object.materialOverrides,
        contact: host === "wall" ? "back" : host === "overhead" ? "top" : "bottom",
        placement,
      });
    }
    for (const light of area.lights) {
      if (light.fixture === null || !light.fixtureVisible) continue;
      const fixtureState = templates.get(light.fixture.templateId, light.fixture.templateVersion);
      const fixtureAsset = fixtureState.state === "ready" ? fixtureState.asset : null;
      // Phase 17.3: a wall-mounted point or spot light stands its fixture on the face (back contact, front = the
      // face's normal), like a wall-hosted object; a wall-mounted strip keeps its face-down mounting at the face.
      const mount = lightWallMount(area, light);
      const onWall = mount !== null && light.geometry.type !== "linear";
      subjects.push({
        id: light.id,
        areaId: area.id,
        lightId: light.id,
        templateId: light.fixture.templateId,
        templateVersion: light.fixture.templateVersion,
        source: light,
        parameters: {},
        flip: { x: false, z: false },
        overrides: {},
        contact: onWall ? "back" : "top",
        ...(light.geometry.type === "linear" ? { lightLengthMm: light.geometry.lengthMm } : {}),
        ...(light.geometry.type === "spot" ||
        (light.geometry.type === "point" && fixtureAsset?.metadata.attachment.contact === "top")
          ? { lightAim: { direction: lightAimOf(area, light), spot: light.geometry.type === "spot" } }
          : {}),
        placement: {
          origin: lightFloorPoint(area, light),
          front: onWall ? mount.normal : headingFront(area.rotationDeg + light.rotationDeg),
          faceDown: !onWall && fixtureAsset?.metadata.attachment.contact === "back",
          facingDeg: linearFacingDeg(light),
          hostDepthMm: undefined,
        },
      });
    }
    return subjects;
  };

  /** Resizes the subject's template, posed by its blend when it animates (setPoses). */
  const resolve = (subject: Subject, asset: TemplateAsset): TemplateResizeResult => {
    const lengthParameter =
      subject.lightLengthMm === undefined ? null : axisSizeParameter("x", asset.metadata.resize.x);
    const pose = poses.get(subject.id);
    const hostDepthMm = subject.placement?.hostDepthMm;
    const parameters =
      lengthParameter === null || subject.lightLengthMm === undefined
        ? subject.parameters
        : { ...subject.parameters, [lengthParameter]: subject.lightLengthMm };
    return templateResize(asset.input, asset.metadata, {
      // A fence keeps its wall's length and height within what its template allows (a 2.4 m wall, a 3 m hedge).
      parameters: subject.fenceWallId === undefined ? parameters : fenceParameters(parameters, asset),
      ...(hostDepthMm === undefined ? {} : { hostDepthMm }),
      flip: subject.flip,
      ...(pose === undefined ? {} : { pose }),
    });
  };

  const partGeometry = (resized: ResizedMesh, boxProjected: boolean): BufferGeometry =>
    resizedGeometry(resized, boxProjected);

  /**
   * Re-poses a built instance: new geometry in the same meshes when the resized parts match its slots one to
   * one, else false (a part appeared or disappeared; the caller rebuilds it).
   */
  const repose = (entry: Entry): Entry | null => {
    if (entry.asset === null) return entry;
    const result = resolve(entry.subject, entry.asset);
    if (!result.ok) return entry;
    if (
      result.meshes.length !== entry.slots.length ||
      result.meshes.some((resized, index) => entry.slots[index]?.part !== partKey(resized))
    )
      return null;
    let boundsLocal: Box3 | null = null;
    for (const [index, resized] of result.meshes.entries()) {
      const slot = entry.slots[index];
      if (slot === undefined) continue;
      const geometry = partGeometry(resized, slot.override !== null);
      slot.mesh.geometry.dispose();
      slot.mesh.geometry = geometry;
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      if (box !== null) boundsLocal = boundsLocal === null ? box.clone() : boundsLocal.union(box);
    }
    return { ...entry, boundsLocal };
  };

  const build = (subject: Subject, asset: TemplateAsset | null, failed: boolean): Entry => {
    const root = new Group();
    root.name = `instance:${subject.id}`;
    root.matrixAutoUpdate = false;
    const slots: MeshSlot[] = [];
    const glows: GlowSlot[] = [];
    const glowCopies = new Map<Material, MeshStandardMaterial>();
    let emitterLocal: readonly [number, number, number] | null = null;
    let screen: ScreenFace | null = null;
    const screenBox = new Box3();
    let boundsLocal: Box3 | null = null;
    const hostDepthMm = subject.placement?.hostDepthMm;
    const isFixture = subject.lightId !== undefined;
    const placeholder = (): void => {
      const mesh = new Mesh(placeholderGeometry(subject, hostDepthMm), placeholderMaterial);
      root.add(mesh);
      slots.push({ mesh, base: placeholderMaterial, override: null });
    };
    if (asset !== null) {
      const result = resolve(subject, asset);
      if (result.ok) {
        const slotByMaterial = new Map(
          Object.entries(templateMaterialSlots(asset.metadata)).map(([slot, name]): [string, string] => [
            name,
            slot,
          ]),
        );
        for (const resized of result.meshes) {
          const slot = resized.materialName === null ? undefined : slotByMaterial.get(resized.materialName);
          const chosen = slot === undefined ? undefined : subject.overrides[slot];
          const preset = chosen !== undefined && isMaterialPresetChoice(chosen) ? chosen.preset : undefined;
          const override = chosen === undefined || isMaterialPresetChoice(chosen) ? null : chosen;
          const geometry = partGeometry(resized, override !== null);
          const mesh = new Mesh(geometry, fallbackMaterial);
          mesh.castShadow = !isFixture;
          mesh.receiveShadow = true;
          root.add(mesh);
          const authored =
            (preset === undefined ? undefined : asset.materials.get(preset)) ??
            (resized.materialName === null ? null : (asset.materials.get(resized.materialName) ?? null));
          // A fixture's glowing materials become its own copies, so its glow can follow its light.
          let base: Material | null = authored;
          if (isFixture && override === null && isGlowing(authored)) {
            let copy = glowCopies.get(authored);
            if (copy === undefined) {
              copy = authored.clone();
              glowCopies.set(authored, copy);
              glows.push({
                material: copy,
                color: [authored.emissive.r, authored.emissive.g, authored.emissive.b],
                intensity: authored.emissiveIntensity,
              });
            }
            base = copy;
          }
          if (override === null && slot !== undefined && slot === asset.metadata.mirror?.materialSlot)
            base = mirrors.material(base);
          // See-through parts (clear glass: a blended, mostly transparent material) let the sun through
          // (Phase 15.5, owner 2026-11-18: windows blocked all sunlight). Blinds, frames and tinted panels
          // still cast shadows, so closed blinds keep blocking it.
          if (override === null && seeThrough(base)) mesh.castShadow = false;
          slots.push({ mesh, base, override, part: partKey(resized) });
          if (slot !== undefined && slot === asset.metadata.screen?.materialSlot) {
            geometry.computeBoundingBox();
            if (geometry.boundingBox !== null) screenBox.union(geometry.boundingBox);
          }
          geometry.computeBoundingBox();
          const box = geometry.boundingBox;
          if (box !== null) boundsLocal = boundsLocal === null ? box.clone() : boundsLocal.union(box);
        }
        if (!screenBox.isEmpty())
          screen = {
            min: screenBox.min.toArray(),
            max: screenBox.max.toArray(),
            front: subject.flip.z ? -1 : 1,
          };
        const lightOrigin = result.nodeOrigins.find((point) => asset.lightNodes.has(point.nodeName));
        const linear = result.linearEmitters[0];
        if (lightOrigin !== undefined) emitterLocal = lightOrigin.position;
        else if (linear !== undefined)
          emitterLocal = [
            (linear.boundsMin[0] + linear.boundsMax[0]) / 2,
            Math.min(linear.boundsMin[1], linear.boundsMax[1]),
            (linear.boundsMin[2] + linear.boundsMax[2]) / 2,
          ];
        else if (isFixture && boundsLocal !== null)
          emitterLocal = fallbackEmitter(boundsLocal, asset.metadata.attachment.contact);
      } else {
        const key = `${subject.id}:${subject.templateId}`;
        if (!warned.has(key)) {
          warned.add(key);
          console.warn(
            `Viewport: instance ${subject.id} (${subject.templateId}) could not be resized: ${result.issues.map((issue) => issue.message).join("; ")}`,
          );
        }
        placeholder();
      }
    } else if (failed) {
      placeholder();
    }
    const entry: Entry = {
      subject,
      asset,
      hostDepthMm,
      root,
      slots,
      emitterLocal,
      screen,
      boundsLocal,
      glows,
    };
    glowEntry(entry);
    return entry;
  };

  const fadedClone = (material: Material, fade: FadeLevel): Material => {
    const clones = fadedClones.get(fade);
    const existing = clones?.get(material);
    if (existing !== undefined) return existing;
    const clone = material.clone();
    clone.transparent = true;
    clone.opacity = material.opacity * opacityOfFade(fade);
    clone.depthWrite = false;
    if (clones === undefined) fadedClones.set(fade, new Map([[material, clone]]));
    else clones.set(material, clone);
    return clone;
  };

  let wallOpeningsVisible = true;
  let lightFixturesVisible = true;
  let concealedLights: ReadonlySet<string> = new Set();
  /** Openings hide with Walls off; light fixtures hide with light controls Off or when hidden. */
  const shown = (subject: Subject): boolean =>
    (wallOpeningsVisible || subject.contact !== "wallable") &&
    (subject.lightId === undefined || (lightFixturesVisible && !concealedLights.has(subject.lightId)));
  return {
    sync: (floor, openingSize, groupOf) => {
      skyVersion += 1;
      const emitters = new Map<string, PlanPoint3>();
      const seen = new Set<string>();
      if (floor !== null) {
        const walls = buildRealAllWalls(floor, openingSize);
        for (const area of floor.areas) {
          for (const subject of subjectsOf(area, walls)) {
            const group = groupOf(area.id, subject.id);
            if (group === null) continue;
            seen.add(subject.id);
            if (subject.placement === null) {
              const stale = entries.get(subject.id);
              if (stale !== undefined) removeEntry(stale);
              entries.delete(subject.id);
              continue;
            }
            const state = templates.get(subject.templateId, subject.templateVersion);
            const asset = state.state === "ready" ? state.asset : null;
            let entry = entries.get(subject.id);
            if (
              entry?.subject.source !== subject.source ||
              entry.asset !== asset ||
              entry.hostDepthMm !== subject.placement.hostDepthMm ||
              entry.slots.length === 0
            ) {
              if (entry !== undefined) removeEntry(entry);
              entry = build(subject, asset, state.state === "failed");
              entries.set(subject.id, entry);
            }
            const matrix = contactMatrix(subject.placement);
            entry.root.visible = shown(subject);
            entry.root.matrix.copy(matrix);
            entry.root.matrixWorldNeedsUpdate = true;
            if (entry.root.parent !== group) group.add(entry.root);
            if (subject.lightId !== undefined && entry.emitterLocal !== null)
              emitters.set(
                subject.lightId,
                transformPoint(
                  matrix,
                  subject.lightAim === undefined || entry.boundsLocal === null
                    ? entry.emitterLocal
                    : mouthEmitter(entry.emitterLocal, entry.boundsLocal, matrix, subject.lightAim),
                ),
              );
          }
        }
      }
      for (const [id, entry] of entries) {
        if (seen.has(id)) continue;
        removeEntry(entry);
        entries.delete(id);
      }
      for (const id of fenceSources.keys()) if (!seen.has(id)) fenceSources.delete(id);
      return emitters;
    },
    applyMaterials: (fadeOf) => {
      for (const entry of entries.values()) {
        const fade = fadeOf(entry.subject.areaId, entry.subject.id);
        for (const slot of entry.slots) {
          if (slot.override !== null) slot.mesh.material = materials.get(slot.override, fade);
          else {
            const base = slot.base ?? fallbackMaterial;
            slot.mesh.material = fade === "normal" ? base : fadedClone(base, fade);
          }
        }
      }
    },
    setWallOpeningsVisible: (visible) => {
      wallOpeningsVisible = visible;
      for (const entry of entries.values()) entry.root.visible = shown(entry.subject);
    },
    bounds: (instanceId) => {
      const entry = entries.get(instanceId);
      if (entry === undefined || entry.slots.length === 0) return null;
      // The box in the model's own frame (detached), then each corner through the placed matrix.
      const parent = entry.root.parent;
      const saved = entry.root.matrix.clone();
      parent?.remove(entry.root);
      entry.root.matrix.identity();
      entry.root.updateMatrixWorld(true);
      const box = new Box3().setFromObject(entry.root, true);
      entry.root.matrix.copy(saved);
      parent?.add(entry.root);
      entry.root.updateMatrixWorld(true);
      if (box.isEmpty()) return null;
      const corners: PlanPoint3[] = [];
      for (const y of [box.min.y, box.max.y])
        for (const [x, z] of [
          [box.min.x, box.min.z],
          [box.max.x, box.min.z],
          [box.max.x, box.max.z],
          [box.min.x, box.max.z],
        ] as const)
          corners.push(worldToPlan(entry.root.localToWorld(new Vector3(x, y, z))));
      return corners;
    },
    root: (instanceId) => entries.get(instanceId)?.root ?? null,
    screen: (instanceId) => entries.get(instanceId)?.screen ?? null,
    setPoses: (next) => {
      const previous = poses;
      poses = next;
      skyVersion += 1;
      let rebuilt = false;
      for (const [id, entry] of entries) {
        if (next.get(id) === previous.get(id)) continue;
        const posed = repose(entry);
        if (posed !== null) {
          entries.set(id, posed);
          continue;
        }
        // A part's visibility changed: build afresh in place of the old model.
        const fresh = build(entry.subject, entry.asset, false);
        fresh.root.matrix.copy(entry.root.matrix);
        fresh.root.matrixWorldNeedsUpdate = true;
        fresh.root.visible = entry.root.visible;
        const parent = entry.root.parent;
        removeEntry(entry);
        parent?.add(fresh.root);
        entries.set(id, fresh);
        rebuilt = true;
      }
      return rebuilt;
    },
    skyOpenings: () => {
      if (skyCache.version === skyVersion) return skyCache;
      const openings: SkyOpening[] = [];
      for (const entry of entries.values()) {
        const opening = skyOpeningOf(entry);
        if (opening !== null) openings.push(opening);
      }
      skyCache = { version: skyVersion, openings };
      return skyCache;
    },
    setFixtureGlow: (glow) => {
      fixtureGlow = glow;
      for (const entry of entries.values()) glowEntry(entry);
    },
    setLightFixturesVisible: (visible) => {
      lightFixturesVisible = visible;
      for (const entry of entries.values()) entry.root.visible = shown(entry.subject);
    },
    setConcealedLights: (lightIds) => {
      concealedLights = lightIds;
      for (const entry of entries.values()) entry.root.visible = shown(entry.subject);
    },
    pickTargets: () => {
      const targets = new Map<Object3D, PickResolver>();
      for (const entry of entries.values()) {
        if (!entry.root.visible) continue;
        const { subject } = entry;
        const fenceWallId = subject.fenceWallId;
        const resolve: PickResolver =
          fenceWallId !== undefined
            ? (hit) => ({
                kind: "wall",
                wallId: fenceWallId,
                areaId: subject.areaId,
                side: "interior",
                pointMm: worldToPlan(hit.point),
              })
            : subject.lightId !== undefined
              ? (hit) => ({
                  kind: "light",
                  lightId: subject.id,
                  areaId: subject.areaId,
                  pointMm: worldToPlan(hit.point),
                })
              : (hit) => ({
                  kind: "object",
                  instanceId: subject.id,
                  areaId: subject.areaId,
                  ...(subject.wallId === undefined ? {} : { wallId: subject.wallId }),
                  pointMm: worldToPlan(hit.point),
                });
        for (const slot of entry.slots) targets.set(slot.mesh, resolve);
      }
      return targets;
    },
    dispose: () => {
      for (const entry of entries.values()) removeEntry(entry);
      entries.clear();
      skyVersion += 1;
      for (const clones of fadedClones.values()) for (const clone of clones.values()) clone.dispose();
      fadedClones.clear();
      placeholderMaterial.dispose();
      fallbackMaterial.dispose();
    },
  };
};
