// Artificial lights of the active floor (spec/builder/features/lighting.md, D08), one entry per light ID,
// placed in their area's group so area previews move them.
//
// Light frame: positionMm is area-relative, elevationMm is the height above the floor, rotationDeg is the
// heading (counterclockwise from the area's +x axis). Spot: tilt 0 = straight down, 90 = horizontal along
// the heading; SpotLight angle = beam/2, penumbra = soft edge. Physical units, decay 2, no range limit.
// Conversions live in lightColor.ts.
//
// Linear (Phase 8.9 carriers; Phase 12 strip term, owner decision 2026-11-18): shadow-casting carriers plus
// one analytic strip term, and an emissive strip (the emitting face, length × Width).
// - Strip term (rules linearStrip.ts, shader stripShading.ts): the diffuse light of a one-sided rectangle of
//   the strip's length and Width, evaluated in every PBR material, so a nearby wall or counter shows one
//   continuous band at any distance. It casts no shadow; a reach from the segment and one clip plane keep it
//   from shining through walls (facing a wall: the wall's face + 60 mm; otherwise 0.1 m above the floor).
//   It carries `share` of the output (85 % for 0.7–1.8 m above the floor or from the wall it faces, all of it
//   within 0.2 m of that wall, 0 for plinth/ceiling strips and strips meeting nothing). Preview-only.
// - Carriers: 1–3, one per ~1.5 m, cast shadows, so walls confine the far field (Phase 7.10); they take the
//   rest of the output. A strip whose term takes all of it keeps its carriers only for the render-scene export
//   (not drawn, no shadow), which writes the light's whole flux as carriers.
// - Facing (Phase 13.3): carriers, term and emissive strip shine along `facingDirection` (shared
//   linearFacing.ts; 0° down, 90° left of the heading, 180° up). For facing ≠ 0, rays along the facing from
//   points along the strip find the first wall (RealAllWalls, `isWallMesh`, up to `wallProbeMm`); the middle
//   ray decides between the wall rule and the floor rule (`linearStripPlan`).
//
// Light confinement (Phase 7.10): walls stop light only through shadow maps, so every emitter casts a shadow,
// up to the host's budget (`shadowBudget`). Emitters beyond the budget shine through walls. The strip term never
// casts (see above).
//
// Stable light topology (Phase 16.6, spec/builder/features/lighting.md#stable-light-topology-phase-166): Three.js
// compiles every lit material for the number of visible point/spot lights and of shadow-casting ones per type, so
// a light appearing, disappearing, or gaining/losing a shadow recompiles every material once (the slow first
// switch). So no emitter's visibility, shadow count, or strip slot depends on whether a light is on: an off light
// stays in the scene at intensity 0 and its shadow map is not redrawn (`shadow.autoUpdate` follows on/off).
// Shadow slots: min(budget, shadowed emitters) of them always cast, so under the budget every emitter casts. Which
// emitters cast follows the earlier rule for the lights that are on (the brightest on emitters by flux, up to the
// budget, ties by light ID and sample index); the remaining slots go to off emitters by light ID. Three.js counts
// point and spot shadows separately, so the split between the two types is kept: it starts from the authored
// output of all shadowed emitters (the top `budget` by `outputLumens`, not on/off or brightness) and moves only
// when the lights that are on need more slots of one type than it has, by the least that fits (over the budget
// only; that one change compiles once, later switches reuse it).
//
// Wall-mounted lights (Phase 17.3, shared/domain/lighting/wallMount.ts): the instance layer stands the fixture on
// the chosen wall face (interior or exterior) and reports its bulb as the emitter; without a fixture emitter the
// light shines 100 mm in front of the face. Nothing confines an artificial light to its room but the shadow maps,
// so a light on an outside wall's exterior face lights the facade and the ground and its own wall keeps it out
// of the room; the sky rules (skyShading.ts) only touch the sky fill and the sun, never artificial lights.
//
// Visuals: a visible fixture whose template is rendered by the instance layer supplies the emitter
// position (at the fixture's mouth, Phase 8.9; see instanceLayer.ts) and shows no marker; its glow follows the
// light through `fixtureGlow`. Otherwise a visible fixture shows a small glowing placeholder sphere (model
// layer, exported) and an invisible source shows a screen-sized editor marker (helper layer, not exported).
// Both are pickable as `light` hits.
import type { Material, Object3D } from "three";
import {
  Matrix3,
  BoxGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D as Target,
  PointLight,
  Raycaster,
  SphereGeometry,
  SpotLight,
  Vector3,
} from "three";
import type { AreaValue } from "@shared/domain/schemas/area";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import { facingDirection, linearFacingDeg } from "@shared/domain/lighting/linearFacing";
import { lightFloorPoint, lightWallMount, wallMountClearanceMm } from "@shared/domain/lighting/wallMount";
import type { LightValue } from "@shared/domain/schemas/light";
import type { HelperMaterials } from "./helperMaterials";
import {
  effectiveLumens,
  fixtureGlowOf,
  lightEmitterColor,
  lumensToCandela,
  lumensToConeCandela,
  previewPhotometricScale,
} from "./lightColor";
import type { FixtureGlow } from "./lightColor";
import type { PickResolver, PickTargets } from "./pickables";
import { worldToPlan } from "./planFrame";
import type { PickHit, PlanPoint3, ScreenPoint } from "./runtimeTypes";
import { buildLightPin, pinDistancePx, styleLightPin } from "./lightPins";
import type { LightPin } from "./lightPins";
import { isWallMesh } from "./floorScene";
import { detachAndDisposeGeometries } from "./sceneObjects";
import type { StripPlan, StripWallHit } from "./linearStrip";
import { linearStripPlan } from "./linearStrip";
import { createStripShading, stripSlotCapacity } from "./stripShading";
import type { StripSource } from "./stripShading";

/** Hard limit on shadow-casting artificial emitters, whatever the GPU allows. */
export const shadowLightCap = 10;
/** Texture units kept free for the sun's shadow map and up to six material maps of a glTF material. */
const reservedTextureUnits = 7;
/** Shadow budget for a renderer with `maxTextures` fragment texture units (16 on most GPUs → 9). */
export const shadowBudget = (maxTextures: number): number =>
  Math.max(0, Math.min(shadowLightCap, maxTextures - reservedTextureUnits));

/**
 * Shadow budget of a whole-house view (Phase 18.1, implementation convention by measurement): every floor's lights
 * share one topology and this budget, the brightest lamps that are on casting first; the rest shine unshadowed. A
 * point light's shadow is six passes over the whole house, so the floor budget would make every switch redraw that
 * many passes over every floor's content. The HA whole house and the builder's overview both use it.
 */
export const houseShadowBudget = 4;

/** Shadow-casting carriers of a linear light: about this far apart, at least one, at most `linearCarriersMax`. */
const linearCarrierSpacingMm = 1500;
const linearCarriersMax = 3;
/** Facing rays measured along a linear light: about this far apart, 2 to `wallRaysMax` (the middle one decides). */
const wallRaySpacingMm = 350;
const wallRaysMax = 12;
/** How far a facing ray looks for a wall; beyond it the strip term's share is 0 anyway. */
const wallProbeMm = 2300;
/** Half-angle of every linear carrier's beam (a 150° cone); penumbra 1 gives a soft, roughly cosine falloff. */
const linearBeamHalfAngle = (75 * Math.PI) / 180;
/** PCF radius of carrier shadows (texels): a strip is a long source, so its shadows are soft. */
const linearShadowRadius = 3;
const pointShadowMapSize = 512;
const spotShadowMapSize = 1024;

/** The sample positions of a strip along its heading, centred on `position`. */
const samplePositions = (position: Vector3, along: Vector3, count: number, length: number): Vector3[] =>
  Array.from({ length: count }, (_, index) =>
    position.clone().addScaledVector(along, ((index + 0.5) / count - 0.5) * length),
  );

type Emitter = PointLight | SpotLight;
/** Luminous flux each linear carrier stands for in the render-scene export (the light's lumens / carriers). */
const linearSampleFlux = new WeakMap<SpotLight, number>();
/** Lumens a linear-light carrier stands for, or undefined when `light` is not one. */
export const linearSampleLumens = (light: SpotLight): number | undefined => linearSampleFlux.get(light);

const placeholderRadiusMm = 45;
const stripThicknessMm = 4;

export type LightsLayer = Readonly<{
  /** fixtureEmitters: floor-frame emitter positions of lights whose fixture template is rendered. */
  sync: (
    floor: BuildingFloorValue | null,
    groupOf: (areaId: string) => Group | null,
    fixtureEmitters: ReadonlyMap<string, PlanPoint3>,
  ) => void;
  pickTargets: () => PickTargets;
  /** Shadow-casting emitters after the last sync (budget-capped; off emitters keep their slots, Phase 16.6). */
  shadowCasterCount: () => number;
  /** Strip slots compiled into the materials (stripShading.ts; 0, 4, 8 or 16). */
  stripSlots: () => number;
  /**
   * Over the shadow budget (Phase 16.6): runs `run` once with each point/spot shadow split one step from the
   * current one applied (castShadow only, restored afterwards; no shadow map is drawn), so a host can precompile
   * the programs a later switch may move to (`renderer.compile`/`compileAsync` gather the lights synchronously).
   */
  withNeighbourSplits: (run: () => void) => void;
  /**
   * Changes the shadow budget (a host's whole-house view lights every floor with one smaller budget, Phase 18.1);
   * applied on the next sync. A different budget is a different light topology: the host compiles for it.
   */
  setShadowBudget: (maxShadowLights: number) => void;
  /** Each light's fixture glow after the last sync (hosts pass it to `InstanceLayer.setFixtureGlow`). */
  fixtureGlow: () => ReadonlyMap<string, FixtureGlow>;
  /** Light controls Off (owner, Phase 5 follow-up): the glowing placeholder and strip are not drawn or picked. */
  setFixturesVisible: (visible: boolean) => void;
  /** Light controls hidden (owner, Phase 5 follow-up): pins are not drawn and cannot be picked. */
  setPinsVisible: (visible: boolean) => void;
  /**
   * Hidden lights (Phase 7.5, P5): no pin, placeholder, or strip, and not pickable; they keep shining (hiding is
   * about seeing elements; switching off is the Lights toggle).
   */
  setConcealed: (lightIds: ReadonlySet<string>) => void;
  /** Pin look (Phase 5.11): the hovered light and the selected lights. */
  setHighlight: (hoveredLightId: string | null, selectedLightIds: readonly string[]) => void;
  /** Lights whose pin is under a screen point, best first (badge, capsule, floor dot, stem). */
  pickScreen: (
    screen: ScreenPoint,
    project: (point: PlanPoint3) => ScreenPoint | null,
    mmPerPx: number,
  ) => readonly Extract<PickHit, { kind: "light" }>[];
  /**
   * Before every render of the scene holding the lights (viewport frames, PNG export): gives the scene's PBR
   * materials the strip term (stripShading.ts) and updates its uniforms (they follow area previews).
   */
  beforeRender: (scene: Object3D) => void;
  dispose: () => void;
}>;

type Entry = {
  key: string;
  light: LightValue;
  readonly areaId: string;
  readonly root: Group;
  readonly emitters: readonly Emitter[];
  /** The emitters that may cast shadows (a linear light's carriers unless its strip term takes all of it). */
  readonly shadowed: readonly Emitter[];
  /** Flux of each shadowed emitter now (0 when off), for the shadow order within a type. */
  readonly emitterLumens: number;
  /** Flux of each shadowed emitter at its authored output (on, full brightness), for the stable slot split. */
  readonly authoredLumens: number;
  readonly glow: FixtureGlow;
  readonly pickable: Object3D | null;
  readonly owned: Material[];
  readonly pin: LightPin;
  /** A linear light's strip term, null when it has none. */
  readonly strip: StripSource | null;
};

const configureShadow = (emitter: Emitter): void => {
  emitter.shadow.camera.near = 0.05;
  emitter.shadow.camera.far = 60;
  emitter.shadow.bias = -0.0008;
  emitter.shadow.normalBias = 0.02;
  const size = emitter instanceof PointLight ? pointShadowMapSize : spotShadowMapSize;
  emitter.shadow.mapSize.set(size, size);
};

const headingRadians = (area: AreaValue, light: LightValue): number =>
  ((area.rotationDeg + light.rotationDeg) * Math.PI) / 180;

const entryKey = (area: AreaValue, emitter: PlanPoint3 | undefined, plan: StripPlan | null): string =>
  [
    area.positionMm.x,
    area.positionMm.y,
    area.rotationDeg,
    emitter?.x ?? "",
    emitter?.y ?? "",
    emitter?.h ?? "",
    plan === null
      ? ""
      : [
          plan.share.toFixed(3),
          Math.round(plan.reachMm / 10),
          plan.plane === null
            ? "-"
            : [
                plan.plane.normal.x.toFixed(3),
                plan.plane.normal.y.toFixed(3),
                plan.plane.normal.z.toFixed(3),
                Math.round(plan.plane.offsetMm / 10),
              ].join(","),
        ].join(","),
  ].join("|");

/** A linear light's emitter frame (floor mm): centre, unit direction along the strip, unit shining direction. */
const linearFrame = (
  area: AreaValue,
  light: LightValue,
  emitterAt: PlanPoint3 | undefined,
): Readonly<{ position: Vector3; along: Vector3; facing: Vector3; heading: number }> => {
  // A wall-mounted light without a fixture emitter shines just in front of its face (Phase 17.3, wallMount.ts).
  const plan = lightFloorPoint(area, light, wallMountClearanceMm);
  const heading = headingRadians(area, light);
  const facing = facingDirection((heading * 180) / Math.PI, linearFacingDeg(light));
  return {
    position: new Vector3(emitterAt?.x ?? plan.x, emitterAt?.y ?? plan.y, emitterAt?.h ?? light.elevationMm),
    along: new Vector3(Math.cos(heading), Math.sin(heading), 0),
    facing: new Vector3(facing.x, facing.y, facing.h),
    heading,
  };
};

const wallRayCount = (lengthMm: number): number =>
  Math.min(wallRaysMax, Math.max(2, Math.ceil(lengthMm / wallRaySpacingMm)));

const probeMaterial = new MeshBasicMaterial({ side: DoubleSide });

/** Whether an object and all its parents are drawn. */
const shownInTree = (object: Object3D): boolean => {
  for (let current: Object3D | null = object; current !== null; current = current.parent)
    if (!current.visible) return false;
  return true;
};

type WallProbe = (group: Group, origins: readonly Vector3[], direction: Vector3) => (StripWallHit | null)[];

/**
 * Measures facing rays against the walls of the scene that holds `start`: rays start in an area group's frame
 * (the floor frame, mm); the result is the first wall face along each ray (distance in mm, point and face normal
 * in the group's frame), null when none is within `wallProbeMm`.
 */
const createWallProbe = (start: Group): WallProbe => {
  let top: Object3D = start;
  while (top.parent !== null) top = top.parent;
  top.updateMatrixWorld(true);
  // Probe copies: a wall layer's materials may not be assigned yet, and the probe sees both faces.
  const probes: Mesh[] = [];
  top.traverse((object) => {
    // Walls not drawn are not there (a host keeps a hidden whole-house exterior, Phase 18.1).
    if (!isWallMesh(object) || !shownInTree(object)) return;
    const probe = new Mesh(object.geometry, probeMaterial);
    probe.matrixWorld.copy(object.matrixWorld);
    probes.push(probe);
  });
  const raycaster = new Raycaster();
  const normalMatrix = new Matrix3();
  return (group, origins, direction) =>
    origins.map((origin) => {
      if (probes.length === 0) return null;
      const from = group.localToWorld(origin.clone());
      const toward = group.localToWorld(origin.clone().addScaledVector(direction, 1000)).sub(from);
      const worldPerMm = toward.length() / 1000;
      raycaster.set(from, toward.normalize());
      raycaster.far = wallProbeMm * worldPerMm;
      const [hit] = raycaster.intersectObjects(probes, false);
      if (hit?.face == null) return null;
      const worldNormal = hit.face.normal
        .clone()
        .applyMatrix3(normalMatrix.getNormalMatrix(hit.object.matrixWorld))
        .normalize();
      const point = group.worldToLocal(hit.point.clone());
      const normal = group.worldToLocal(hit.point.clone().add(worldNormal)).sub(point).normalize();
      return {
        distanceMm: hit.distance / worldPerMm,
        point: { x: point.x, y: point.y, z: point.z },
        normal: { x: normal.x, y: normal.y, z: normal.z },
      };
    });
};

/** maxShadowLights: the host's shadow budget (see `shadowBudget`). */
export const createLightsLayer = (materials: HelperMaterials, initialShadowLights: number): LightsLayer => {
  let maxShadowLights = Math.max(0, Math.floor(initialShadowLights));
  const entries = new Map<string, Entry>();
  let hovered: string | null = null;
  let pinsVisible = true;
  let fixturesVisible = true;
  let concealed: ReadonlySet<string> = new Set();
  let selected = new Set<string>();
  let casters = 0;
  /** Shadow slots per emitter type (Phase 16.6), kept while the floor's shadowed emitters stay the same. */
  let split: { point: number; spot: number; of: string } | null = null;
  const stripShading = createStripShading();
  const stateOf = (lightId: string): "normal" | "hovered" | "selected" =>
    hovered === lightId ? "hovered" : selected.has(lightId) ? "selected" : "normal";

  const removeEntry = (entry: Entry): void => {
    detachAndDisposeGeometries(entry.root);
    for (const emitter of entry.emitters) {
      emitter.shadow.dispose();
      emitter.dispose();
    }
    for (const material of entry.owned) material.dispose();
  };

  /** Pins follow the light controls, placeholders and strips the fixture visibility; hidden lights show neither. */
  const applyShown = (entry: Entry): void => {
    const hidden = concealed.has(entry.light.id);
    entry.pin.group.visible = pinsVisible && !hidden;
    if (entry.pickable !== null) entry.pickable.visible = fixturesVisible && !hidden;
  };

  /** plan: a linear light's strip plan (`linearStripPlan`), null for other lights. */
  const build = (
    area: AreaValue,
    light: LightValue,
    emitterAt: PlanPoint3 | undefined,
    plan: StripPlan | null,
  ): Entry => {
    const root = new Group();
    root.name = `light:${light.id}`;
    const owned: Material[] = [];
    const { position, along, facing, heading } = linearFrame(area, light, emitterAt);
    const lumens = effectiveLumens(light);
    const color = lightEmitterColor(light);
    const emitters: Emitter[] = [];
    const shadowed: Emitter[] = [];
    /** Carriers kept only for the render-scene export (the strip term takes all of the preview's output). */
    const exportOnly = new Set<Emitter>();
    let emitterLumens = lumens;
    let authoredLumens = light.defaults.outputLumens;
    let strip: StripSource | null = null;

    if (light.geometry.type === "linear") {
      // Shadow-casting carriers for confinement and the far field, the strip term for the band on near
      // surfaces (see the header). The two share the strip's flux.
      const length = light.geometry.lengthMm;
      const carriers = Math.min(linearCarriersMax, Math.max(1, Math.round(length / linearCarrierSpacingMm)));
      const share = plan?.share ?? 0;
      const drawn = share < 1;
      emitterLumens = (lumens * (1 - share)) / carriers;
      authoredLumens = (light.defaults.outputLumens * (1 - share)) / carriers;
      samplePositions(position, along, carriers, length).forEach((at, index) => {
        const spot = new SpotLight(
          color,
          lumensToConeCandela(emitterLumens, linearBeamHalfAngle, 1) * previewPhotometricScale,
          0,
          linearBeamHalfAngle,
          1,
          2,
        );
        spot.position.copy(at);
        const target = new Target();
        target.position.copy(at).addScaledVector(facing, 1000);
        root.add(target);
        spot.target = target;
        spot.name = `emitter:${light.id}#${String(index)}`;
        linearSampleFlux.set(spot, lumens / carriers);
        if (drawn) shadowed.push(spot);
        else exportOnly.add(spot);
        emitters.push(spot);
      });
      if (plan !== null && share > 0)
        strip = {
          frame: root,
          center: { x: position.x, y: position.y, z: position.z },
          along: { x: along.x, y: along.y, z: along.z },
          facing: { x: facing.x, y: facing.y, z: facing.z },
          lengthMm: length,
          widthMm: light.geometry.widthMm,
          reachMm: plan.reachMm,
          plane: plan.plane,
          color,
          lumens: lumens * share,
        };
      if (light.fixture !== null && light.fixtureVisible && emitterAt === undefined) {
        const glow = new MeshBasicMaterial({
          color:
            lumens > 0 ? color.clone().multiplyScalar(1 / Math.max(color.r, color.g, color.b)) : 0x555555,
          toneMapped: false,
        });
        owned.push(glow);
        const strip = new Mesh(
          new BoxGeometry(light.geometry.lengthMm, light.geometry.widthMm, stripThicknessMm),
          glow,
        );
        strip.position.copy(position);
        // Turned about its length by the facing first, then to the heading.
        strip.rotation.set((linearFacingDeg(light) * Math.PI) / 180, 0, heading, "ZYX");
        root.add(strip);
      }
    } else {
      const candela = lumensToCandela(lumens) * previewPhotometricScale;
      let emitter: Emitter;
      if (light.geometry.type === "spot") {
        const tilt = (light.spot.tiltDeg * Math.PI) / 180;
        const halfAngle = Math.min((light.spot.beamAngleDeg * Math.PI) / 360, Math.PI / 2);
        // A typed lamp's lumens are the real lamp's, so its beam carries them (Phase 8.9); an untyped spot
        // keeps the isotropic glTF convention, so existing houses look as before.
        const spot = new SpotLight(
          color,
          light.lampType === undefined
            ? candela
            : lumensToConeCandela(lumens, halfAngle, light.spot.softEdge) * previewPhotometricScale,
          0,
          halfAngle,
          light.spot.softEdge,
          2,
        );
        const target = new Target();
        target.position.set(
          position.x + Math.sin(tilt) * Math.cos(heading) * 1000,
          position.y + Math.sin(tilt) * Math.sin(heading) * 1000,
          position.z - Math.cos(tilt) * 1000,
        );
        root.add(target);
        spot.target = target;
        emitter = spot;
      } else {
        emitter = new PointLight(color, candela, 0, 2);
      }
      emitter.position.copy(position);
      emitter.name = `emitter:${light.id}`;
      emitters.push(emitter);
      shadowed.push(emitter);
    }
    for (const emitter of emitters) {
      configureShadow(emitter);
      if (light.geometry.type === "linear") emitter.shadow.radius = linearShadowRadius;
      // Stable topology (Phase 16.6): an off emitter stays visible at intensity 0, and its shadow map, drawn once
      // when it is built, is not redrawn while it is off.
      emitter.visible = !exportOnly.has(emitter);
      emitter.shadow.autoUpdate = lumens > 0;
      emitter.shadow.needsUpdate = true;
      root.add(emitter);
    }

    let pickable: Object3D | null = null;
    if (emitterAt === undefined) {
      if (light.fixture !== null && light.fixtureVisible && light.geometry.type !== "linear") {
        const glow = new MeshBasicMaterial({
          color: lumens > 0 ? fixtureGlowOf(light).color : 0x666666,
          toneMapped: false,
        });
        owned.push(glow);
        const sphere = new Mesh(new SphereGeometry(placeholderRadiusMm, 16, 12), glow);
        sphere.position.copy(position);
        root.add(sphere);
        pickable = sphere;
      } else if (light.fixture === null || !light.fixtureVisible) {
        // An invisible source is shown and picked by its pin alone (Phase 5.11).
        pickable = null;
      } else {
        const strip = root.children.find((child) => child instanceof Mesh);
        pickable = strip ?? null;
      }
    }
    const pin = buildLightPin(light, { x: position.x, y: position.y, h: position.z }, heading, lumens > 0);
    styleLightPin(materials, pin, stateOf(light.id));
    root.add(pin.group);
    const entry: Entry = {
      key: "",
      light,
      areaId: area.id,
      root,
      emitters,
      shadowed,
      emitterLumens,
      authoredLumens,
      glow: fixtureGlowOf(light),
      pickable,
      owned,
      pin,
      strip,
    };
    applyShown(entry);
    return entry;
  };

  /**
   * Shadow slots (Phase 16.6, see the header): a fixed number of emitters cast; the on emitters the earlier rule
   * picks always do; the point/spot split is kept unless they need it moved. An emitter that starts casting draws
   * its map on the next shadow pass.
   */
  const assignShadows = (): void => {
    const candidates = [...entries.values()].flatMap((entry) =>
      entry.shadowed.map((emitter, index) => ({ entry, emitter, index })),
    );
    type Candidate = (typeof candidates)[number];
    type Kind = "point" | "spot";
    const kind = (emitter: Emitter): Kind => (emitter instanceof PointLight ? "point" : "spot");
    const byId = (a: Candidate, b: Candidate): number =>
      a.entry.light.id.localeCompare(b.entry.light.id) || a.index - b.index;
    const slots = Math.min(maxShadowLights, candidates.length);
    const available = { point: 0, spot: 0 };
    for (const candidate of candidates) available[kind(candidate.emitter)] += 1;
    // A new set of shadowed emitters (a floor, an added or removed light) starts from the authored split.
    const of = candidates
      .map((candidate) => `${candidate.entry.light.id}#${String(candidate.index)}:${kind(candidate.emitter)}`)
      .join(",");
    if (split?.of !== of) {
      const start = { point: 0, spot: 0 };
      for (const candidate of [...candidates]
        .sort((a, b) => b.entry.authoredLumens - a.entry.authoredLumens || byId(a, b))
        .slice(0, slots))
        start[kind(candidate.emitter)] += 1;
      split = { ...start, of };
    }
    const order = [...candidates].sort((a, b) => b.entry.emitterLumens - a.entry.emitterLumens || byId(a, b));
    // The earlier rule's pick among the lights that are on, per type: the split must hold it.
    const needed = { point: 0, spot: 0 };
    for (const candidate of order.filter((each) => each.entry.emitterLumens > 0).slice(0, slots))
      needed[kind(candidate.emitter)] += 1;
    const point = Math.min(
      Math.max(split.point, needed.point, slots - available.spot),
      available.point,
      slots - needed.spot,
    );
    split = { point, spot: slots - point, of };
    const castersFor = (pointSlots: number): Set<Emitter> => {
      const left = { point: pointSlots, spot: slots - pointSlots };
      const casting = new Set<Emitter>();
      for (const candidate of order) {
        const type = kind(candidate.emitter);
        if (left[type] === 0) continue;
        left[type] -= 1;
        casting.add(candidate.emitter);
      }
      return casting;
    };
    const casting = castersFor(point);
    casters = casting.size;
    for (const entry of entries.values())
      for (const emitter of entry.emitters) {
        const casts = casting.has(emitter);
        if (casts && !emitter.castShadow) emitter.shadow.needsUpdate = true;
        emitter.castShadow = casts;
      }
    // The splits one step away (what a single switch most often moves to), for `withNeighbourSplits`. Only over
    // the budget is there one: under it every emitter casts.
    neighbours = [point - 1, point + 1]
      .filter((each) => each >= 0 && each <= available.point && slots - each <= available.spot)
      .map((each) => castersFor(each));
  };
  let neighbours: Set<Emitter>[] = [];

  let glows: ReadonlyMap<string, FixtureGlow> = new Map();

  return {
    sync: (floor, groupOf, fixtureEmitters) => {
      const seen = new Set<string>();
      const strips: StripSource[] = [];
      let probe: WallProbe | undefined;
      for (const area of floor?.areas ?? []) {
        const group = groupOf(area.id);
        if (group === null) continue;
        for (const light of area.lights) {
          seen.add(light.id);
          const emitterAt = fixtureEmitters.get(light.id);
          let plan: StripPlan | null = null;
          if (light.geometry.type === "linear") {
            const frame = linearFrame(area, light, emitterAt);
            const facingDeg = linearFacingDeg(light);
            let walls: (StripWallHit | null)[] | null = null;
            if (facingDeg % 360 !== 0) {
              probe ??= createWallProbe(group);
              const origins = samplePositions(
                frame.position,
                frame.along,
                wallRayCount(light.geometry.lengthMm),
                light.geometry.lengthMm,
              );
              walls = probe(group, origins, frame.facing);
            }
            const facing = { x: frame.facing.x, y: frame.facing.y, z: frame.facing.z };
            plan = linearStripPlan(frame.position.z, facingDeg, facing, walls);
            // Past the shader's slots, the carriers take all of the output (document order decides).
            if (plan.share > 0 && strips.length >= stripSlotCapacity) plan = { ...plan, share: 0 };
          }
          // A wall-mounted light follows its wall (its face point is derived), so the point is part of the key.
          const mounted = lightWallMount(area, light);
          const key = `${entryKey(area, emitterAt, plan)}|${mounted === null ? "" : `${mounted.point.x.toFixed(0)},${mounted.point.y.toFixed(0)},${mounted.side}`}`;
          let entry = entries.get(light.id);
          if (entry?.light !== light || entry.key !== key) {
            if (entry !== undefined) removeEntry(entry);
            entry = build(area, light, emitterAt, plan);
            entry.key = key;
            entries.set(light.id, entry);
          }
          if (entry.strip !== null) strips.push(entry.strip);
          if (entry.root.parent !== group) group.add(entry.root);
        }
      }
      for (const [id, entry] of entries) {
        if (seen.has(id)) continue;
        removeEntry(entry);
        entries.delete(id);
      }
      assignShadows();
      stripShading.setStrips(strips);
      glows = new Map([...entries].map(([id, entry]) => [id, entry.glow]));
    },
    beforeRender: (scene) => stripShading.beforeRender(scene),
    shadowCasterCount: () => casters,
    stripSlots: () => stripShading.slots(),
    withNeighbourSplits: (run) => {
      const emitters = [...entries.values()].flatMap((entry) => entry.emitters);
      const current = new Map(emitters.map((emitter) => [emitter, emitter.castShadow]));
      for (const casting of neighbours) {
        for (const emitter of emitters) emitter.castShadow = casting.has(emitter);
        run();
      }
      for (const [emitter, casts] of current) emitter.castShadow = casts;
    },
    setShadowBudget: (next) => {
      const budget = Math.max(0, Math.floor(next));
      if (budget === maxShadowLights) return;
      maxShadowLights = budget;
      // A new budget starts from the authored split again.
      split = null;
    },
    fixtureGlow: () => glows,
    pickTargets: () => {
      const targets = new Map<Object3D, PickResolver>();
      for (const entry of entries.values()) {
        if (entry.pickable?.visible !== true) continue;
        const { areaId } = entry;
        const lightId = entry.light.id;
        targets.set(entry.pickable, (hit) => ({
          kind: "light",
          lightId,
          areaId,
          pointMm: worldToPlan(hit.point),
        }));
      }
      return targets;
    },
    setFixturesVisible: (visible) => {
      fixturesVisible = visible;
      for (const entry of entries.values()) applyShown(entry);
    },
    setPinsVisible: (visible) => {
      pinsVisible = visible;
      for (const entry of entries.values()) applyShown(entry);
    },
    setConcealed: (lightIds) => {
      concealed = lightIds;
      for (const entry of entries.values()) applyShown(entry);
    },
    setHighlight: (nextHovered, nextSelected) => {
      const nextSet = new Set(nextSelected);
      const changed = new Set<string>([
        ...(hovered === null ? [] : [hovered]),
        ...(nextHovered === null ? [] : [nextHovered]),
        ...[...selected].filter((id) => !nextSet.has(id)),
        ...[...nextSet].filter((id) => !selected.has(id)),
      ]);
      hovered = nextHovered;
      selected = nextSet;
      for (const id of changed) {
        const entry = entries.get(id);
        if (entry !== undefined) styleLightPin(materials, entry.pin, stateOf(id));
      }
    },
    pickScreen: (screen, project, mmPerPx) =>
      [...entries.values()]
        .filter(() => pinsVisible)
        .flatMap((entry) => {
          if (!entry.root.visible || entry.root.parent?.visible === false || concealed.has(entry.light.id))
            return [];
          const score = pinDistancePx(entry.pin, screen, project, mmPerPx);
          return score === null ? [] : [{ entry, score }];
        })
        .sort((a, b) => a.score - b.score || a.entry.light.id.localeCompare(b.entry.light.id))
        .map(({ entry }) => ({
          kind: "light" as const,
          lightId: entry.light.id,
          areaId: entry.areaId,
          pointMm: entry.pin.position,
        })),
    dispose: () => {
      for (const entry of entries.values()) removeEntry(entry);
      entries.clear();
    },
  };
};
