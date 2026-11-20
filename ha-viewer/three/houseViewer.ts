// The read-only house viewer runtime (spec/home-assistant/viewer-mvp.md#houseviewer). Framework-free.
// The house itself is drawn by the builder's own renderer modules (src/renderer: floor scene, instance
// layer, template/material/texture caches), so the viewer matches the builder's 3D view exactly. Assets
// load through the API. The viewer owns only the stage, lighting, camera, render loop, light states from
// Home Assistant, and gestures on lights. Navigation is the builder's gesture map (src/renderer/navigationInput.ts)
// on the viewer's own orbit camera (viewerOrbit.ts), plus primary and touch drags (dragNavigation.ts; Phase 14.6).
import { noInsets } from "./frameInsets";
import type { FrameInsets } from "./frameInsets";
export { noInsets };
export type { FrameInsets };
import type { Intersection, Material, MeshStandardMaterial, Object3D, Texture } from "three";
import {
  Box3,
  Group,
  Light,
  LightShadow,
  PointLight,
  Mesh,
  Plane,
  Raycaster,
  Vector2,
  PCFShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { HouseDocument } from "@shared/domain/schemas/house";
import { houseWithFloor } from "@shared/domain/house/visibility";
import type {
  HaAreaViewValue,
  HaBubbleAnchorValue,
  HaStateValueValue,
} from "@shared/domain/schemas/homeAssistant";
import { parametersWithLiveStates } from "@shared/domain/homeAssistant/stateParameters";
import type { AreaValue } from "@shared/domain/schemas/area";
import type { AreableInstanceValue, WallableInstanceValue } from "@shared/domain/schemas/instances";
import { templateStateParameterInfo } from "@shared/domain/templates/metadata";
import type { TemplateStateParameter } from "@shared/domain/templates/metadata";
import type { LightValue } from "@shared/domain/schemas/light";
import { openingSizeFromParameters } from "@shared/domain/templates/openingSize";
import { createEffectsLayer, effectsLayer } from "../../src/renderer/effectsLayer";
import type { EffectLive } from "../../src/renderer/effectsLayer";
import { createFloorScene } from "../../src/renderer/floorScene";
import type { FloorBounds } from "../../src/renderer/floorScene";
import { createHelperMaterials } from "../../src/renderer/helperMaterials";
import { helperPalette } from "../../src/renderer/helperPalette";
import { createInstanceLayer } from "../../src/renderer/instanceLayer";
import type { InstanceLayer } from "../../src/renderer/instanceLayer";
import type { FloorScene } from "../../src/renderer/floorScene";
import { createSkyShading } from "../../src/renderer/skyShading";
import type { SkyShading } from "../../src/renderer/skyShading";
import { createMirrorSurfaces } from "../../src/renderer/mirrorSurface";
import { createLighting, previewToneMapping, sunSettingsFromPosition } from "../../src/renderer/lighting";
import type { Lighting } from "../../src/renderer/lighting";
import { createLightsLayer, houseShadowBudget, shadowBudget } from "../../src/renderer/lightsLayer";
import { environmentSun, sunDirectionPlan } from "@shared/domain/environment/sun";
import { createMaterialCache } from "../../src/renderer/materialCache";
import { createPlanRoot, planToWorld } from "../../src/renderer/planFrame";
import type { AssetReader } from "../../src/renderer/assetTransport";
import { createTemplateCache } from "../../src/renderer/templateCache";
import type { TemplateCache, TemplateState } from "../../src/renderer/templateCache";
import type { PlanPoint3 } from "../../src/renderer/runtimeTypes";
import { createScreenLayer } from "../../src/renderer/screenLayer";
import { createStateAnimator } from "../../src/renderer/stateAnimation";
import type { ScreenImage } from "../../src/renderer/screenLayer";
import { createTextureCache } from "../../src/renderer/textureCache";
import type { SwatchMemory } from "../../src/renderer/textureCache";
import { createFrameScheduler } from "../../src/renderer/frameScheduler";
import { watchViewportVisibility } from "../../src/renderer/viewportVisibility";
import type { ViewportVisibility } from "../../src/renderer/viewportVisibility";
import type { AnimationHandle, FrameScheduler } from "../../src/renderer/frameScheduler";
import { createLoadQueue } from "../../src/renderer/loadQueue";
import { createHouseExterior } from "../../src/renderer/houseExterior";
import type { RoofLayer } from "../../src/renderer/roofLayer";
import { attachedRoofsOnly, createRoofLayer } from "../../src/renderer/roofLayer";
import { floorFenceSegments, yardFenceSegments } from "@shared/geometry/yardFences";
import type { HouseExterior } from "../../src/renderer/houseExterior";
import type { FloorStep, ViewerView } from "../floorNavigation";
import { floorSlideChannel, slidePose, startFloorSlide } from "./floorTransition";
import type { FloorSlide, SlidePose } from "./floorTransition";
import { floorToHouseOffset } from "@shared/geometry/placement";
import { floorPlacementOf, floorsByElevation } from "@shared/domain/house/floorPlacement";
import { isMesh } from "../../src/renderer/sceneObjects";
import { batchBucketName } from "../../src/renderer/staticBatch";
import { createLoadTiming } from "./loadTiming";
import type { LoadStage, LoadTiming } from "./loadTiming";
import type { Gesture } from "../haActions";
import { gestureTiming, TapSequence } from "../gestures";
import type { GestureTarget } from "../gestures";
import { roomFrame } from "../bubbleLayout";
import { viewerFloor } from "../viewerFloor";
import type { RoomFrame, ScreenPoint } from "../bubbleLayout";
import { createStage, darkStage, lightStage } from "./stage";
import type { Stage } from "./stage";
import { computeAreaFloorGeometry } from "@shared/geometry/areaGeometry";
import { strongerFade } from "../../src/renderer/surfaceMaterialKey";
import { createRoomCutaway } from "./roomCutaway";
import { deviceRenderer } from "./renderers";
import type { Backdrop, ViewerRenderer } from "./renderers";
import type { RoomCutaway } from "./roomCutaway";
import { chooseView, floorSamples } from "./roomFocus";
import type { OrbitView } from "./roomFocus";
import {
  lightStage as lightPickStage,
  objectStage as objectPickStage,
  roomStage,
  roomVolumes,
  runPickStages,
} from "./roomPicking";
import type { PickStage, ViewerPick } from "./roomPicking";
import { occluder } from "./roomVolumes";
import { createIntrusionSweeps } from "./intrusionSweep";
import { cameraAxes, fitFloor } from "./floorFraming";
import type { FloorFit, FramePoint, FrameWindow } from "./floorFraming";
import { springOmega, springStep } from "./springs";
import type { IntrusionRoom, IntrusionSweeps } from "./intrusionSweep";
import type { HaNavigationValue, HaSweepCornerValue } from "@shared/domain/schemas/homeAssistant";
import { attachNavigationInput } from "../../src/renderer/navigationInput";
import type { NavigationInput } from "../../src/renderer/navigationInput";
import { wheelNavigation } from "../navigationSetting";
import { attachDragNavigation } from "./dragNavigation";
import type { DragNavigation } from "./dragNavigation";
import { ViewerOrbit } from "./viewerOrbit";
import type { Occluder, PlanRay, RoomVolume } from "./roomVolumes";

/** What a live-state override reads and replaces on an object or opening (9.7). */
type StatedInstance = Readonly<{
  id: string;
  templateId: string;
  templateVersion: number;
  parameters: Readonly<Record<string, number | boolean | string>>;
}>;
type StatedCache<T> = Map<string, { source: T; key: string; value: T }>;

const stageRadiusM = 40;
/** The view is shifted so the house sits on the backdrop glow in the lower third (fraction of height). */
const viewShiftDown = 0.05;
const fovDeg = 35;
/** Default view (owner 2026-11-16: 28° was too frontal): a diagonal look down onto the floor. */
const defaultElevationDeg = 52;
const defaultAzimuthDeg = 35;
const defaultPolar = Math.PI / 2 - (defaultElevationDeg * Math.PI) / 180;
/** The orbit limits of drags (about 10° to 80° from straight up): the camera never goes under the floor. */
const minPolar = (10 * Math.PI) / 180;
const maxPolar = (80 * Math.PI) / 180;
/** Top view (14.6): straight down, as the builder's Look straight down (cameraRig.ts `minPolar`). */
const topPolar = 0.02;

// ---- Staged opening (Phase 15.1): implementation conventions, see spec/home-assistant/viewer-mvp.md#loading-and-the-opening-sequence
/** Load lanes: doors and windows with the house model, then house textures, then the separate objects. */
const houseLane = 0;
const textureLane = 1;
const objectLane = 2;
/** Templates and images in flight at once. */
const loadConcurrency = 3;
/** The house model waits at most this long for its doors and windows before it is shown (ms). */
const houseWaitMs = 2500;
/** A background shader compile is waited for at most this long (ms); then the frame compiles what is left. */
const compileWaitMs = 3000;
/** The opening has settled once the camera has been still this long (ms)... */
const openingQuietMs = 400;
/** ...or at the latest this long after the house appeared (ms). */
const openingMaxMs = 5000;
/** Batches of objects are added at most this often (ms): one instance sync per batch. */
const admitGapMs = 120;
/** The most templates whose objects one batch places (Phase 21.5, implementation convention). */
const admitBatchTemplates = 6;
/** GPU texture uploads per frame: at least one, more while the frame has spent less than `uploadBudgetMs` on them. */
const maxUploadsPerFrame = 3;
const uploadBudgetMs = 4;
/** While objects load, their shadows are redrawn at most this often (ms); state and light changes redraw at once. */
const loadingShadowGapMs = 500;
/** A Three.js layer no camera renders: meshes whose shaders compile in the background wait here. */
const warmLayer = 31;
/** The whole house is merged floor by floor (18.1) once nothing has changed for this long (ms)... */
const batchQuietMs = 300;
/** ...one floor per step, this far apart (ms), so no frame waits for the whole house. */
const batchStepMs = 50;
/** Multisampling of a floor switch's departing copy (the canvas is antialiased). */

/** Loading of the separate objects and textures after the opening (15.1), for the progress bar. */
export type LoadProgress = Readonly<{ stage: LoadStage; total: number; remaining: number }>;

const loadingTemplate: TemplateState = { state: "loading" };

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

/** The view buttons (14.6): back to the framing, look straight down, or a quarter turn; each then fits. */
export type ViewPreset = "fit" | "top" | "turn";
/** The whole house's floor box (16.13), in the theme accent. */
const highlightColor = 0x03a9f4;
/** A placed bubble's free point sits this far above the surface tapped (mm). */
const placedLiftMm = 150;
/** Placing a bubble within this distance of a light's emitter on screen attaches it to the light (px). */
const lightSnapPx = 24;
/** An object's bubble floats this far above the object's top (mm). */
const objectBubbleLiftMm = 150;

/** Drawn: the object and every parent are visible (a hidden light's fixture group is not, Phase 7.5). */
const drawn = (object: Object3D): boolean => {
  for (let current: Object3D | null = object; current !== null; current = current.parent)
    if (!current.visible) return false;
  return true;
};

/** Where house assets come from; the viewer passes the house ID of the shown house. */
export type ViewerAssets = Readonly<{
  readAsset?: AssetReader;
  templateUrl: (houseId: string, templateId: string, version: number) => string;
  imageUrl: (houseId: string, imageId: string) => string;
}>;

/**
 * Camera tilt relative to the default view, in radians: positive when tilted down toward the floor
 * (a lower, more horizontal view), negative when looking more from above.
 */
export type TiltListener = (tilt: number) => void;

/** A light's state from Home Assistant; null fields keep the authored default. */
export type LightState = Readonly<{
  on: boolean;
  /** 0..1 */
  brightness: number | null;
  /** sRGB 0..255 */
  rgb: readonly [number, number, number] | null;
  kelvin: number | null;
  /** The light's output re-adjusted in HA Settings (13.6), replacing the house's; brightness still scales it. */
  lumens: number | null;
}>;

/**
 * Parts of the screen covered beside the house, as fractions of its width (left, right) and height (top, bottom):
 * the room panel, or the floor widgets (13.7). The view is framed into the rest.
 */

/** What a tap picks in Edit mode (D25): a light, an object, or a room, by the builder's stable ID. */
export type EditPick = Readonly<{ kind: "lights" | "objects" | "areas"; id: string }>;

export type HouseViewerOptions = Readonly<{
  assets: ViewerAssets;
  onTilt?: TiltListener;
  /** A gesture on a light or an object with actions (tap, hold, double tap; Phase 8.3). */
  onGesture?: (target: GestureTarget, gesture: Gesture) => void;
  /** Whether a target has a double-tap action; only then does a tap wait to see if a second one follows. */
  hasDoubleTap?: (target: GestureTarget) => boolean;
  /**
   * Whether an object, door, or window takes gestures (8.3, 10.1: it has an action, or a default one such as an
   * AC's or a bound opening's more-info); one that does not is looked past, so the tap reaches its room.
   */
  objectActs?: (objectId: string) => boolean;
  /** After every frame (camera moves included): the bubble overlay re-projects its anchors (8.5). */
  onFrame?: () => void;
  /**
   * The screen insets the view is framed into, whenever they change (every frame of their spring): the backdrop
   * follows the free area with them (14.5).
   */
  onInsets?: (insets: FrameInsets) => void;
  /** Edit mode: a tap goes here first; true consumes it (placing a bubble, 8.5). */
  onEditTap?: (clientX: number, clientY: number) => boolean;
  /** A tap on a room (not on a light): the screen opens that area. */
  onAreaSelect?: (areaId: string) => void;
  /** A double tap on empty space while an area is open: the screen closes it. */
  onAreaDismiss?: () => void;
  /** Edit mode (D25): a tap picks the light, object, or room under it instead of running gestures. */
  onEditPick?: (pick: EditPick) => void;
  /** Called after every rendered frame (the harness frame counter, Phase 8.4). */
  onRender?: () => void;
  /** Corner picking (8.6): a tap near a corner of the picking room; the room's new list of sweep corners. */
  onCornerPick?: (areaId: string, corners: readonly HaSweepCornerValue[]) => void;
  /** Staged loading (15.1): the remaining objects and textures, whenever that changes (the progress bar). */
  onLoadProgress?: (progress: LoadProgress) => void;
  /** Images' remembered average colours (15.1): objects draw them until their textures are ready. */
  swatches?: SwatchMemory;
  /** Logs per-stage load timings to the console (opt-in, dev). */
  timing?: boolean;
  /** The whole-house view (16.1): a tap or click on a floor opens it. */
  onFloorSelect?: (floorId: string) => void;
}>;

/** Where the camera is heading; each part springs toward its goal (owner 2026-11-16: no robotic easing). */
type CameraMove = Readonly<{
  toTarget: Vector3;
  toDistance: number;
  toAzimuth: number;
  toPolar: number;
  /** The screen insets the view is framed into (the room panel, 8.1; the floor widgets, 13.7). */
  toInsets: FrameInsets;
  /** False once the view was grabbed (14.6): the camera stays where the hand puts it; only the insets spring on. */
  camera: boolean;
}>;

/** An open room's framing (its saved view or its fit), for the Fit, Top view and Rotate 90° buttons (14.6). */
type RoomGoal = Readonly<{ target: Vector3; distance: number; azimuth: number; polar: number }>;

/** Spring velocities of a camera move; kept across a new goal so a quick second tap flows on. */
type MoveVelocity = {
  target: Vector3;
  distance: number;
  azimuth: number;
  polar: number;
  insets: { left: number; right: number; top: number; bottom: number };
};

const restingVelocity = (): MoveVelocity => ({
  target: new Vector3(),
  distance: 0,
  azimuth: 0,
  polar: 0,
  insets: { left: 0, right: 0, top: 0, bottom: 0 },
});

const insetSides = ["left", "right", "top", "bottom"] as const;

const sameInsets = (a: FrameInsets, b: FrameInsets): boolean =>
  insetSides.every((side) => Math.abs(a[side] - b[side]) < 0.001);

/** No insets: the whole screen. */

/** A pick that takes gestures (a light or an object), or null (a room or nothing). */
const gestureTargetOf = (pick: ViewerPick | null): GestureTarget | null =>
  pick?.kind === "light"
    ? { kind: "light", id: pick.lightId }
    : pick?.kind === "object"
      ? { kind: "object", id: pick.objectId }
      : null;

const templateKey = (templateId: string, version: number): string => `${templateId}@${String(version)}`;

const wrapAngle = (radians: number): number =>
  ((((radians + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;

/** The shown house and floor; `floorId` is null in the whole-house view (16.1). */
type Shown = Readonly<{ house: HouseDocument; floorId: string | null }>;

type Press = {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  moved: boolean;
  held: boolean;
  holdTimer: number;
};

const lightOff: LightState = { on: false, brightness: null, rgb: null, kelvin: null, lumens: null };

/**
 * The authored light with its defaults replaced by the HA state (enabled, brightness, colour) and its HA overrides
 * (13.6: lumens; a temperature override arrives as `kelvin`). Brightness multiplies the output once, as authored.
 */
const withState = (light: LightValue, state: LightState): LightValue => {
  const color =
    state.rgb !== null
      ? { ...light.defaults.color, mode: "rgb" as const, rgb: [...state.rgb] }
      : state.kelvin !== null
        ? {
            ...light.defaults.color,
            mode: "colorTemperature" as const,
            kelvin: Math.min(Math.max(state.kelvin, 1500), 9000),
          }
        : light.defaults.color;
  return {
    ...light,
    defaults: {
      ...light.defaults,
      enabled: state.on,
      brightness: state.brightness ?? light.defaults.brightness,
      outputLumens: state.lumens ?? light.defaults.outputLumens,
      color,
    },
  };
};

export class HouseViewer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(fovDeg, 1, 0.1, 500);
  /** The orbit camera state the gestures and the spring moves drive (14.6). */
  private readonly orbit: ViewerOrbit;
  /** The builder's gesture map (wheel, pinch, middle button) and the viewer's primary and touch drags. */
  private readonly navigationInput: NavigationInput;
  private readonly drags: DragNavigation;
  private navigation: HaNavigationValue = "trackpad";
  /** Pointers down on the canvas: a second one turns the press into a pan / pinch, never a tap. */
  private readonly downPointers = new Set<number>();
  private readonly stage: Stage;
  /**
   * The builder's sun and sky (src/renderer/lighting.ts): the sun follows Home Assistant's real sun (setSolar),
   * fades through twilight, and at night the sky drops to a faint ambient so the lamps carry the scene.
   */
  private readonly lighting: Lighting = createLighting();
  /** The last solar position from Home Assistant (compass azimuth, elevation), or null for the default sun. */
  private solar: Readonly<{ azimuthDeg: number; elevationDeg: number }> | null = null;
  private readonly environment: PMREMGenerator;
  private readonly planRoot = createPlanRoot();
  /** The sun's parent: the plan root's centring offset, without its scale and rotation. */
  private readonly sunRoot = new Group();
  /**
   * Stand-ins for the floor view's scene and instances while the whole house is shown (Phase 21.4): never synced,
   * so the cutaway, sweeps and sky see no floor there. A floor view uses the house's own (`floorScene`, `instances`).
   */
  private readonly emptyScene: FloorScene;
  private readonly emptyInstances: InstanceLayer;
  /** A floor view's attached roofs (canopies, Phase 19.3); the cutting roof is drawn in the whole house only. */
  private readonly floorRoofs: RoofLayer;
  /** Mirror slots (Phase 9.1) reflect the scene's environment map. */
  private readonly mirrors: ReturnType<typeof createMirrorSurfaces>;
  private readonly templates: ReturnType<typeof createTemplateCache>;
  /**
   * The templates the instance layer may place (15.1): while the opening runs and objects load, a template that has
   * loaded counts as loading until its batch is admitted, so no other sync (an HA state, a light) places it early,
   * outside a batch and before its shaders compiled.
   */
  private readonly placed: TemplateCache;
  private readonly materials: ReturnType<typeof createMaterialCache>;
  private readonly textures: ReturnType<typeof createTextureCache>;
  private readonly helperMaterials: ReturnType<typeof createHelperMaterials>;
  private readonly lights: ReturnType<typeof createLightsLayer>;
  /** Sky light indoors (Phase 15.5, src/renderer/skyShading.ts): window portals and the reduced indoor fill. */
  private readonly sky: SkyShading;
  /** Ambient effects (D24): frames are view-only renders that never redraw the shadow maps. */
  private readonly effects: ReturnType<typeof createEffectsLayer>;
  /** TV screen pictures (Phase 8.8): the running app of a bound media_player. */
  private readonly screens = createScreenLayer();
  private readonly raycaster = new Raycaster();
  private readonly onTilt: TiltListener;
  private readonly onGesture: (target: GestureTarget, gesture: Gesture) => void;
  private readonly hasDoubleTap: (target: GestureTarget) => boolean;
  private readonly objectActs: (objectId: string) => boolean;
  private readonly onFrame: () => void;
  private readonly onInsets: (insets: FrameInsets) => void;
  /** The insets last handed to `onInsets`. */
  private reportedInsets: FrameInsets | null = null;
  private readonly onEditTap: (clientX: number, clientY: number) => boolean;
  private readonly onAreaSelect: (areaId: string) => void;
  private readonly onAreaDismiss: () => void;
  private readonly onEditPick: (pick: EditPick) => void;
  private readonly onRender: () => void;
  private readonly onCornerPick: (areaId: string, corners: readonly HaSweepCornerValue[]) => void;
  /** Presence / intrusion sweeps (Phase 8.6): an overlay; its frames never redraw the shadow maps. */
  private readonly sweeps: IntrusionSweeps;
  private cornerPickArea: string | null = null;
  /** Edit mode (D25): taps pick things to bind; no gestures run. */
  private editing = false;
  private framing = { center: new Vector3(), distance: 10 };
  private move: CameraMove | null = null;
  private moveVelocity: MoveVelocity = restingVelocity();
  private lastMoveStep = 0;
  /**
   * The screen insets (fractions of its width and height) the view is framed into now: the area panel's share on
   * the right while a room is open, else the floor widgets' (13.7). The house is centered in the rest.
   */
  private insets: FrameInsets = noInsets;
  /** The floor widgets' insets, used whenever no room is open (13.7). */
  private floorInsets: FrameInsets = noInsets;
  private focused = false;
  /** The open room's framing, while one is open (14.6 view buttons). */
  private roomGoal: RoomGoal | null = null;
  private viewSize = { width: 0, height: 0 };
  /** Lights hidden by their Shown when (Phase 21), concealed on every floor's content. */
  private hiddenLights: ReadonlySet<string> = new Set();
  /** Fixture emitter positions from the last instance sync, for the lights layer. */
  private emitters: ReadonlyMap<string, PlanPoint3> = new Map();
  private lightStates: ReadonlyMap<string, LightState> = new Map();
  /** Overridden lights by ID, reused while neither the authored light nor its state changed. */
  private readonly stated = new Map<string, { source: LightValue; state: LightState; value: LightValue }>();
  /** Live state-parameter values from HA by object or opening ID (Phase 9.7); drawn, never stored. */
  private instanceStates: ReadonlyMap<string, Readonly<Record<string, HaStateValueValue>>> = new Map();
  /** Objects and openings drawn with live states, reused while the authored one and its parameters are unchanged. */
  private readonly statedObjects: StatedCache<AreableInstanceValue> = new Map();
  private readonly statedOpenings: StatedCache<WallableInstanceValue> = new Map();
  /** Animated state changes (Phase 10.2): drawn parameters ease to new live values; frames run only meanwhile. */
  private readonly stateAnimator = createStateAnimator();
  private posing = false;
  private press: Press | null = null;
  private readonly taps = new TapSequence();
  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.pointerDown(event);
  };
  private readonly handlePointerMove = (event: PointerEvent): void => {
    this.pointerMove(event);
  };
  private readonly handlePointerUp = (event: PointerEvent): void => {
    this.pointerUp(event);
  };
  private readonly handleHover = (event: PointerEvent): void => {
    this.hover(event);
  };
  private readonly handleLeave = (): void => {
    this.setHover(null);
  };
  /** A lost WebGL context may be restored (the browser decides); preventing the default allows that. */
  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
  };
  /** Three re-uploads its resources on restore; the static shadow maps must be redrawn explicitly. */
  private readonly handleContextRestored = (): void => {
    if (this.disposed) return;
    this.renderer.shadowMap.needsUpdate = true;
    this.requestRender();
  };
  /**
   * Every floor of the house, built once (16.1, complete since 18.1; Phase 21.4: the only copy): the whole-house view
   * draws all of it; a floor view draws its floor from here (`floorScene`, `instances`) with the others hidden and
   * only that floor's content kept.
   */
  private readonly exterior: HouseExterior;
  /** The viewer's view of each authored floor (viewerFloor), kept while the authored floor is the same value. */
  private readonly viewerFloors = new WeakMap<BuildingFloorValue, BuildingFloorValue>();
  /** The floor shown before the whole house (its content loads first there), or null. */
  private lastFloorId: string | null = null;
  /** The floor under the mouse in the whole-house view (outlined), or null. */
  private hoverFloor: string | null = null;
  private readonly onFloorSelect: (floorId: string) => void;
  /**
   * A floor switch's ride (16.13; Phase 21.5: over the house's real floors, no copy): the departing view's frame
   * origin in the house, the plan root's place then, and the departing camera; kept until the ride ends.
   */
  private ride: Readonly<{ origin: PlanPoint3; anchor: Vector3; from: SlidePose }> | null = null;
  /** How far the departing view's content moved in the world when the destination was placed (the ride's offset). */
  private readonly rideShift = new Vector3();
  /**
   * During a floor switch's preparation and ride (21.5, owner): the destination's objects wait, so only its shell and
   * doors and windows ride in; they load after the ride, a few templates at a time, with the bar.
   */
  private holdObjects = false;
  /** Templates waiting to be placed when loading began (the bar's total when everything is cached). */
  private heldAtLoading = 0;
  private slide: FloorSlide | null = null;
  /** The ride's eased progress while a switch shows (0 until the ride starts), else null. */
  private slideProgress: number | null = null;
  /** Where the departing camera was (its orbit) when the switch started. */
  private rideFrom: Readonly<{
    target: Vector3;
    distance: number;
    azimuth: number;
    polar: number;
  }> | null = null;
  private lastTilt = Number.NaN;
  private shown: Shown | null = null;
  /** Objects and light fixtures: hidden from the glass reflection, which shows only walls, doors, and windows. */
  private unreflected: Object3D[] = [];
  private bounds: FloorBounds | null = null;
  /** The shown floor's outline around its box centre, for the default framing (14.3). */
  private outline: readonly FramePoint[] = [];
  /** Room cutaway while a room is open (Phase 8.2a). */
  private readonly cutaway: RoomCutaway;
  /**
   * This device's renderer (Phase 21.11, renderers.ts), read once: the frame draw, the room fade, limits, reflection,
   * backdrop and the floors during a ride. The glass reflection is off in every built-in renderer (owner,
   * 2026-11-20: a frame took 11.5 ms with it against about 4 ms without, on the demo Family house's ground floor,
   * desktop); `setReflection` still turns it on.
   */
  private readonly rendering: ViewerRenderer = deviceRenderer();
  /** Dev readout (Phase 21.1): the slowest render since the readout last asked (ms). */
  private worstRenderMs = 0;
  /** Room hit volumes of the shown floor (Phase 8.1). */
  private volumes: readonly RoomVolume[] = [];
  /** Host wall of each door and window of the shown floor. */
  private openingWalls: ReadonlyMap<string, string> = new Map();
  /** The one frame scheduler of this viewport (15.3): camera moves, state animations, and asset work. */
  private readonly frames: FrameScheduler;
  private readonly visibility: ViewportVisibility;
  private cameraAnimation: AnimationHandle | null = null;
  private statesAnimation: AnimationHandle | null = null;
  private assetsAnimation: AnimationHandle | null = null;
  /** Staged loading (15.1): the queue the template and texture caches load through. */
  private readonly loadQueue = createLoadQueue(loadConcurrency);
  private loadStage: LoadStage = "preparing";
  /** Bumped by every showView: callbacks of an earlier opening sequence do nothing. */
  private stageToken = 0;
  /** Template keys (id@version) of the shown floor's doors and windows: loaded with the house model. */
  private houseTemplateKeys: ReadonlySet<string> = new Set();
  /** Template keys whose instances were added (and whose shaders compiled, unless in `warmingKeys`). */
  private readonly admittedKeys = new Set<string>();
  private readonly warmingKeys = new Set<string>();
  /** A template finished loading since the last batch. */
  private templatesDirty = false;
  private lastAdmitAt = 0;
  private admitTimer = 0;
  /** Decoded images waiting for their GPU upload, a few per frame. */
  private readonly uploads: { texture: Texture; resolve: () => void }[] = [];
  /** Material twins that compiled mapped shaders (kept until loading is done, so the programs stay alive). */
  private warmTwins: { group: Group; material: Material }[] = [];
  /** Mapped shaders compiling in the background. */
  private mapWarms = 0;
  /** Run after the next rendered frame (background compiles of what that frame patched). */
  private afterRender: (() => void)[] = [];
  /** A throttled shadow redraw is owed (objects added while loading). */
  private shadowsDue = false;
  private lastShadowAt = Number.NEGATIVE_INFINITY;
  private shadowTimer = 0;
  private openingTimer = 0;
  private openingCapTimer = 0;
  /** The next merge step of the whole house (18.1), or 0. */
  private batchTimer = 0;
  private dropOpeningWatch: (() => void) | null = null;
  /** The first frame after the house model's compile: it draws the shadow maps, then the canvas fades in. */
  private revealPending = false;
  private lastFrameAt: number | null = null;
  private readonly onLoadProgress: (progress: LoadProgress) => void;
  private readonly timing: LoadTiming | null;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, options: HouseViewerOptions) {
    const assets = options.assets;
    this.onTilt = options.onTilt ?? (() => undefined);
    this.onGesture = options.onGesture ?? (() => undefined);
    this.hasDoubleTap = options.hasDoubleTap ?? (() => false);
    this.objectActs = options.objectActs ?? (() => false);
    this.onFrame = options.onFrame ?? (() => undefined);
    this.onInsets = options.onInsets ?? (() => undefined);
    this.onEditTap = options.onEditTap ?? (() => false);
    this.onAreaSelect = options.onAreaSelect ?? (() => undefined);
    this.onAreaDismiss = options.onAreaDismiss ?? (() => undefined);
    this.onEditPick = options.onEditPick ?? (() => undefined);
    this.onRender = options.onRender ?? (() => undefined);
    this.onCornerPick = options.onCornerPick ?? (() => undefined);
    this.onLoadProgress = options.onLoadProgress ?? (() => undefined);
    this.timing = options.timing === true ? createLoadTiming() : null;
    this.onFloorSelect = options.onFloorSelect ?? (() => undefined);
    this.frames = createFrameScheduler(
      {
        now: () => performance.now(),
        request: (callback) => requestAnimationFrame(callback),
        cancel: (handle) => {
          cancelAnimationFrame(handle);
        },
      },
      (now) => {
        this.renderFrame(now);
      },
    );
    // The house model fades in once its shaders are compiled and its first shadow pass is drawn (15.1).
    canvas.toggleAttribute("data-preparing", true);
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = previewToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    // Static shadow maps (Phase 7.10): redrawn only when the content or a light changes, never for camera moves.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.rendering.limits().pixelRatioCap));
    canvas.addEventListener("webglcontextlost", this.handleContextLost);
    canvas.addEventListener("webglcontextrestored", this.handleContextRestored);

    this.environment = new PMREMGenerator(this.renderer);
    this.scene.environment = this.environment.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;

    this.stage = createStage(stageRadiusM, lightStage);
    this.scene.add(this.stage.root);

    // The builder's renderer modules. Helper outlines live on the helper layer, which this camera never
    // renders, so only the model shows.
    const houseId = (): string => this.shown?.house.id ?? "";
    const invalidate = (): void => {
      this.requestRender();
    };
    // Staged loading (15.1): images and templates load through the queue, images decode off the main thread and
    // upload a few per frame; a material takes its map once its mapped shader has compiled in the background.
    this.textures = createTextureCache(
      (imageId) => assets.imageUrl(houseId(), imageId),
      Math.min(8, this.renderer.capabilities.getMaxAnisotropy()),
      invalidate,
      assets.readAsset,
      {
        queue: this.loadQueue,
        lane: textureLane,
        prepare: (texture) => this.queueUpload(texture),
        ...(options.swatches === undefined ? {} : { swatches: options.swatches }),
        ...(this.timing === null ? {} : { onTiming: this.timing.texture }),
      },
    );
    this.materials = createMaterialCache(this.textures, {
      beforeMap: (material, map) => this.warmMap(material, map),
      onMapped: invalidate,
    });
    this.emptyScene = createFloorScene(this.materials, helperPalette("light"));
    this.templates = createTemplateCache(
      (templateId, version) => assets.templateUrl(houseId(), templateId, version),
      () => {
        this.templateLoaded();
      },
      assets.readAsset,
      {
        queue: this.loadQueue,
        laneOf: (templateId, version) =>
          this.houseTemplateKeys.has(templateKey(templateId, version)) ? houseLane : objectLane,
        ...(this.timing === null ? {} : { onTiming: this.timing.template }),
      },
    );
    const templates = this.templates;
    const gated = (templateId: string, version: number, state: TemplateState): TemplateState => {
      const key = templateKey(templateId, version);
      return state.state === "loading" ||
        this.loadStage === "done" ||
        (this.loadStage === "preparing" && (!this.holdObjects || this.houseTemplateKeys.has(key))) ||
        this.admittedKeys.has(key)
        ? state
        : loadingTemplate;
    };
    this.placed = {
      get: (templateId, version) => gated(templateId, version, templates.get(templateId, version)),
      peek: (templateId, version) => {
        const state = templates.peek(templateId, version);
        return state === null ? null : gated(templateId, version, state);
      },
      dispose: () => undefined,
    };
    this.loadQueue.subscribe(() => {
      this.reportProgress();
    });
    this.mirrors = createMirrorSurfaces(this.renderer, this.scene.environment);
    this.emptyInstances = createInstanceLayer(this.placed, this.materials, this.mirrors);
    this.exterior = createHouseExterior(this.materials, helperPalette("light"), highlightColor, {
      templates: this.placed,
      mirrors: this.mirrors,
    });
    this.floorRoofs = createRoofLayer(this.materials, this.placed);
    // The shown floor's scene changes with the view (21.4): these read it when they need it.
    const shownScene = (): FloorScene => this.floorScene;
    this.sky = createSkyShading({
      get frame(): Object3D {
        return shownScene().root;
      },
      content: this.planRoot,
      rooms: () => shownScene().indoorRooms(),
      openings: () => this.instances.skyOpenings(),
      lighting: this.lighting,
    });
    // The builder's lights layer draws each light's emitter from its defaults, which HA states override.
    this.helperMaterials = createHelperMaterials(helperPalette("light"));
    this.lights = createLightsLayer(
      this.helperMaterials,
      this.floorShadowBudget(),
      this.rendering.limits().pointShadowSize,
    );
    this.lights.setPinsVisible(false);
    this.effects = createEffectsLayer(() => {
      this.requestRender();
    });
    this.camera.layers.enable(effectsLayer);
    this.stage.setReflectionVisible(this.rendering.reflection());
    // Objects hidden for the reflection pass come back as they were (a hidden one stays hidden).
    let reflectionHidden: Object3D[] = [];
    this.stage.setReflectionFilter((visible) => {
      if (!visible) {
        reflectionHidden = this.unreflected.filter((object) => object.visible);
        for (const object of reflectionHidden) object.visible = false;
      } else {
        for (const object of reflectionHidden) object.visible = true;
        reflectionHidden = [];
      }
      this.effects.setShown(visible);
      this.sweeps.setShown(visible);
    });
    this.cutaway = createRoomCutaway({
      get floorScene(): FloorScene {
        return shownScene();
      },
      planRoot: this.planRoot,
      applyMaterials: (layersChanged) => {
        this.applyMaterials();
        if (layersChanged) {
          this.collectUnreflected();
          this.renderer.shadowMap.needsUpdate = true;
        }
      },
      invalidate,
    });
    this.cutaway.setMode(this.rendering.roomFade());
    this.cutaway.setDitherLevels(this.rendering.ditherLevels());
    this.sweeps = createIntrusionSweeps({
      planRoot: this.planRoot,
      get floorScene(): FloorScene {
        return shownScene();
      },
      cutUniforms: this.cutaway.cutUniforms,
      camera: this.camera,
      canvas,
      requestFrame: invalidate,
    });
    this.scene.add(this.sweeps.root);
    this.planRoot.add(this.emptyScene.root, this.exterior.root);
    // The sun lives in world metres like the builder's (src/renderer/viewportRuntime.ts), never under the plan root's
    // mm → m scale: there it sat 3.6 cm from its target, so its shadow camera started at floor level and wall tops
    // and ceilings cast no sun shadows (owner report, 2026-11-18). It only follows the plan root's centring offset.
    this.sunRoot.add(this.lighting.root);
    this.scene.add(this.sunRoot);
    this.applySun();
    this.scene.add(this.planRoot);

    this.orbit = new ViewerOrbit(
      this.camera,
      { minPolar, maxPolar, minDistance: 1, maxDistance: 100 },
      () => {
        this.applyDepth();
        this.camera.updateProjectionMatrix();
        this.requestRender();
      },
    );
    // Tap listeners first: on a release they read whether the press became a drag before the drags forget it.
    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointermove", this.handlePointerMove);
    canvas.addEventListener("pointerup", this.handlePointerUp);
    canvas.addEventListener("pointercancel", this.handlePointerUp);
    canvas.addEventListener("pointermove", this.handleHover);
    canvas.addEventListener("pointerleave", this.handleLeave);
    this.drags = attachDragNavigation(canvas, this.orbit, {
      slopPx: gestureTiming.tapSlopPx,
      onGrab: () => {
        this.grab();
      },
    });
    this.navigationInput = attachNavigationInput(canvas, this.orbit, {
      navigation: () => wheelNavigation(this.navigation),
      // Primary presses are taps or the drags above, never the builder's tool input.
      primaryDrag: () => null,
      onPrimaryDragStart: () => undefined,
      onCamera: () => {
        this.grab();
      },
      onPointer: () => undefined,
      onDoubleClick: () => undefined,
      gestureZoom: () => !this.drags.pinching(),
    });
    // Off screen (16.11): no frames, animation steps, effect or sweep ticks until the viewport is back; then one
    // frame draws the current state.
    this.visibility = watchViewportVisibility(canvas, (onScreen) => {
      this.setOnScreen(onScreen);
    });
    this.setOnScreen(this.visibility.onScreen());
    this.frame();
  }

  /** Pauses or resumes everything that draws or ticks (16.11). */
  private setOnScreen(onScreen: boolean): void {
    this.frames.setPaused(!onScreen);
    this.effects.setPaused(!onScreen);
    this.sweeps.setPaused(!onScreen);
  }

  /**
   * Shows the whole house (16.1: the exterior of every floor, stacked; multi-floor houses) or one building floor of
   * `house`; templates and textures stream in afterwards (15.1). Every floor's shell is the house's one copy (21.4):
   * a view only changes which floors show and which floors keep their content. With `slide`, a floor switch (16.13,
   * 21.5): the departing frame stays on screen while the destination prepares (its doors and windows, its lights'
   * shaders compiled in the background), then the camera rides vertically by the floors' elevation difference (same
   * angles, distance, and horizontal place) past the real floors: the destination and the floors below it, the floors
   * above hidden at once, the departing floor's objects removed at once. One render per frame. The destination's
   * objects load after the ride, with the bar; a separate fit move follows the ride.
   */
  showView(house: HouseDocument, view: ViewerView, slide: FloorStep | null = null): void {
    const angles = this.cameraAngles();
    // No hover box in the departing copy.
    this.setHover(null);
    const sliding = slide !== null && this.beginRide();
    if (!sliding) this.dropDeparting();
    const floorId = view.kind === "floor" ? view.floorId : null;
    // Saved-hidden things are never drawn here, hidden lights included (viewerFloor.ts).
    const authored =
      floorId === null ? undefined : house.floors.find((candidate) => candidate.id === floorId);
    const allFloors = { ...house, floors: house.floors.map((floor) => this.viewerFloorOf(floor)) };
    const shownHouse =
      floorId === null
        ? allFloors
        : authored === undefined
          ? house
          : houseWithFloor(house, this.viewerFloorOf(authored));
    const previousFloor = this.shown?.floorId ?? null;
    if (previousFloor !== null) this.lastFloorId = previousFloor;
    this.cutaway.focus(null);
    this.stateAnimator.clear();
    this.statesAnimation?.cancel();
    this.posing = false;
    this.setHover(null);
    this.shown = { house: shownHouse, floorId };
    this.restartStages();
    this.holdObjects = sliding;
    // Objects the destination already draws (the whole house's, entering one of its floors) stay drawn.
    if (sliding && floorId !== null) {
      const content = this.exterior.floorParts(floorId)?.content ?? null;
      for (const instance of this.floorInstances())
        if (content?.root(instance.id) != null) this.admittedKeys.add(instance.key);
    }
    this.syncExterior(allFloors, floorId, sliding);
    this.floorRoofs.sync(floorId === null ? null : (this.shownFloor() ?? null), attachedRoofsOnly);
    this.floorScene.root.add(this.floorRoofs.root);
    this.volumes = roomVolumes(this.shownFloor()?.areas ?? []);
    this.openingWalls = new Map(
      (this.shownFloor()?.areas ?? []).flatMap((area) =>
        area.walls.flatMap((wall) => wall.objects.map((opening): [string, string] => [opening.id, wall.id])),
      ),
    );
    this.syncInstances();
    this.sweeps.setFloor(this.shownFloor());
    this.bounds = this.houseView()?.bounds() ?? this.floorScene.bounds();
    this.placeRoots();
    this.outline = this.outlinePoints();
    this.lighting.fit(this.bounds);
    this.applySun();
    this.frame(sliding ? angles : null);
    if (sliding) this.rideFraming();
    this.waitForHouseModel(this.stageToken);
  }

  /**
   * The house's floors for a view (21.4): every floor built (unchanged ones keep everything), the shown floor (or the
   * whole house) shown, and only the shown floors' content kept: a floor view drops the other floors' objects. Content
   * loads in order: a floor view's floor; in the whole house the floor last shown first, else the one nearest the
   * ground. `riding`: a floor switch, so the floors below the destination stay shown until the ride ends.
   */
  private syncExterior(house: HouseDocument, floorId: string | null, riding: boolean): void {
    const exterior = this.exterior;
    this.lights.setShadowBudget(
      floorId === null ? Math.min(houseShadowBudget, this.floorShadowBudget()) : this.floorShadowBudget(),
    );
    exterior.setContentFloors(floorId === null ? null : new Set([floorId]));
    if (floorId === null) {
      const ground = floorsByElevation(house.floors).find(
        (floor) => floorPlacementOf(floor).elevationMm >= 0,
      );
      exterior.setLoadOrder(
        [this.lastFloorId, ground?.id].filter((id): id is string => id !== null && id !== undefined),
      );
    } else exterior.setLoadOrder([floorId]);
    exterior.setFocus(
      floorId === null ? null : { floorId, withBelow: riding && this.rendering.floorsBelowDuringRide() },
    );
    exterior.sync(house, openingSizeFromParameters);
  }

  /** The shown floor's scene (the house's own, 21.4), or the empty stand-in in the whole house. */
  private get floorScene(): FloorScene {
    const floorId = this.shown?.floorId ?? null;
    return (floorId === null ? null : this.exterior.floorParts(floorId)?.scene) ?? this.emptyScene;
  }

  /** The shown floor's instances (the house's own, 21.4), or the empty stand-in in the whole house. */
  private get instances(): InstanceLayer {
    const floorId = this.shown?.floorId ?? null;
    return (floorId === null ? null : this.exterior.floorParts(floorId)?.content) ?? this.emptyInstances;
  }

  /** The whole house while it is shown, else null (a floor view keeps it hidden). */
  private houseView(): HouseExterior | null {
    return this.shown !== null && this.shown.floorId === null ? this.exterior : null;
  }

  /** The viewer's floor (saved-hidden things left out), the same value while the authored floor is unchanged. */
  private viewerFloorOf(floor: BuildingFloorValue): BuildingFloorValue {
    const known = this.viewerFloors.get(floor);
    if (known !== undefined) return known;
    const shown = viewerFloor(floor);
    this.viewerFloors.set(floor, shown);
    return shown;
  }

  /** The floors whose content is drawn: every floor in the whole-house view, else the shown floor. */
  private contentFloors(): readonly BuildingFloorValue[] {
    const shown = this.shown;
    if (shown === null) return [];
    if (shown.floorId === null) return shown.house.floors;
    const floor = this.shownFloor();
    return floor === null ? [] : [floor];
  }

  /** Centres the shown floor (or house) on the stage: plan (x, y) mm → world (x/1000, −y/1000) m. */
  private placeRoots(): void {
    const center = this.planCenter();
    this.planRoot.position.set(-center.x / 1000, 0, center.y / 1000);
    this.sunRoot.position.copy(this.planRoot.position);
  }

  /** The camera's angles now (a running move's goal, else where it is): a floor switch keeps them (16.3). */
  private cameraAngles(): Readonly<{ azimuth: number; polar: number }> {
    const goal = this.cameraGoal();
    return { azimuth: goal.toAzimuth, polar: goal.toPolar };
  }

  // ---- floor switch (16.3, 16.13) -------------------------------------------------------------------------

  /** The shown view's frame origin in the house (mm): the floor's placement, or the house's zero (whole house). */
  private viewOrigin(): PlanPoint3 {
    const floor = this.shownFloor();
    return floor === null ? { x: 0, y: 0, h: 0 } : floorToHouseOffset(floor);
  }

  /**
   * Keeps where the departing view was for the ride: true when the switch moves. The canvas keeps showing its last
   * frame while the destination prepares, since nothing is drawn meanwhile. A switch while the previous destination
   * is still being prepared keeps that start (it is still what shows); one during a ride first snaps that ride to its
   * end. No ride off screen (16.11), or before anything was drawn.
   */
  private beginRide(): boolean {
    if (this.disposed || !this.visibility.onScreen() || this.shown === null) return false;
    if (this.ride !== null && this.slide === null) return true;
    this.slide?.finish();
    if (this.loadStage === "preparing" || this.revealPending) return false;
    const canvas = this.renderer.domElement;
    if (canvas.width === 0 || canvas.height === 0) return false;
    const camera = this.camera;
    this.ride = {
      origin: this.viewOrigin(),
      anchor: this.planRoot.position.clone(),
      from: {
        position: [camera.position.x, camera.position.y, camera.position.z],
        quaternion: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w],
        projection: [...camera.projectionMatrix.elements],
      },
    };
    // The ride starts where the camera is (a running fit or room move stops here; the fit after the ride redoes it).
    this.move = null;
    this.cameraAnimation?.cancel();
    this.rideFrom = {
      target: this.orbit.target.clone(),
      distance: this.orbit.distance,
      azimuth: this.orbit.azimuth,
      polar: this.orbit.polar,
    };
    this.slideProgress = 0;
    // The departing frame stays on screen while the destination prepares: no fade-out (data-preparing).
    canvas.style.transition = "none";
    canvas.style.opacity = "1";
    return true;
  }

  /**
   * The ride's end (owner 16.13: an elevator outside the house): the camera at rest exactly above or below where it
   * was, by the floors' elevation difference: same angles, distance, and horizontal position, so the ride is a
   * vertical translation (no zoom). The ride's start is the departing camera moved with the departing floor's
   * content (the plan root is now placed for the destination). When the ride completes, a separate fit move (camera
   * channel, the usual spring) fits the destination. The pan limits widen to keep that place.
   */
  private rideFraming(): void {
    const ride = this.ride;
    const from = this.rideFrom;
    if (ride === null || from === null) return;
    const origin = this.viewOrigin();
    this.planRoot.updateMatrixWorld(true);
    const at = this.planRoot.localToWorld(
      new Vector3(ride.origin.x - origin.x, ride.origin.y - origin.y, ride.origin.h - origin.h),
    );
    const shift = this.rideShift.copy(at).sub(ride.anchor);
    const orbit = this.orbit;
    orbit.target.set(from.target.x + shift.x, from.target.y, from.target.z + shift.z);
    orbit.reachM = Math.max(
      orbit.reachM,
      Math.hypot(orbit.target.x - orbit.centre.x, orbit.target.z - orbit.centre.z) + 1,
    );
    orbit.floorM = Math.min(orbit.floorM, orbit.target.y - 1);
    orbit.ceilingM = Math.max(orbit.ceilingM, orbit.target.y + 1);
    orbit.distance = from.distance;
    orbit.azimuth = from.azimuth;
    orbit.polar = from.polar;
    orbit.apply();
    this.setDistanceLimits(from.distance);
    this.applyDepth();
    this.applyViewOffset();
  }

  /** Ends any floor switch now: a running ride snaps to its end, a waiting one ends. */
  private dropDeparting(): void {
    if (this.slide !== null) this.slide.finish();
    else if (this.ride !== null) this.endRide();
  }

  /**
   * The end state of a switch: the canvas back to its own styles, and the floors below the destination hidden again
   * (their shadows go with them, so the maps are redrawn once).
   */
  private endRide(): void {
    const ridden = this.ride !== null;
    this.ride = null;
    this.slideProgress = null;
    this.rideFrom = null;
    const canvas = this.renderer.domElement;
    canvas.style.removeProperty("opacity");
    canvas.style.removeProperty("transition");
    if (!ridden || this.disposed) return;
    const floorId = this.shown?.floorId ?? null;
    this.exterior.setFocus(floorId === null ? null : { floorId, withBelow: false });
    this.renderer.shadowMap.needsUpdate = true;
    this.requestRender();
  }

  /**
   * The ride (once the destination's first frame is drawn): on the "floor" channel of the frame scheduler, about
   * 0.6 s, eased. Each frame the camera is placed along the ride (drawScene). However the ride ends, the end state
   * is put in place (floorTransition.ts).
   */
  private startSlide(): void {
    this.slide = startFloorSlide({
      frames: this.frames,
      apply: (eased) => {
        this.slideProgress = eased;
      },
      settle: (end) => {
        this.slide = null;
        this.endRide();
        // Step 2 (owner 16.13): a separate fit move on the camera channel, once the ride is over. A ride ended by a
        // new switch starts that switch's ride instead; a resize reframes by itself; disposal does nothing.
        if (end === "completed" && !this.disposed) {
          this.reframeFloor();
          // The destination's objects load once the ride is over (21.5), not after the fit that follows it.
          this.beginLoading(this.stageToken);
        }
        this.requestRender();
      },
    });
  }

  /** Puts the camera where the ride is (from the departing camera, moved, to the resting one); returns the resting pose. */
  private placeSlideCamera(ride: Readonly<{ from: SlidePose }>, progress: number): SlidePose {
    const camera = this.camera;
    const resting: SlidePose = {
      position: [camera.position.x, camera.position.y, camera.position.z],
      quaternion: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w],
      projection: [...camera.projectionMatrix.elements],
    };
    const shift = this.rideShift;
    const [x, y, z] = ride.from.position;
    const from: SlidePose = { ...ride.from, position: [x + shift.x, y + shift.y, z + shift.z] };
    const pose = slidePose(from, resting, progress);
    camera.position.set(...pose.position);
    camera.quaternion.set(...pose.quaternion);
    camera.projectionMatrix.fromArray(pose.projection);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.updateMatrixWorld();
    return resting;
  }

  private restoreCamera(resting: SlidePose): void {
    this.camera.position.set(...resting.position);
    this.camera.quaternion.set(...resting.quaternion);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  // ---- whole-house view (16.1) --------------------------------------------------------------------------------

  /** The floor of the whole-house view under a screen point, or null (in a floor view, always null). */
  private floorAtPoint(clientX: number, clientY: number): string | null {
    const exterior = this.houseView();
    if (exterior === null) return null;
    for (const hit of this.hitsAt(clientX, clientY)) {
      const floorId = exterior.floorAt(hit.object);
      if (floorId !== null) return floorId;
    }
    return null;
  }

  /** A mouse over the whole house outlines the floor under it (no buttons pressed; touch has no hover). */
  private hover(event: PointerEvent): void {
    if (this.houseView() === null || event.pointerType !== "mouse" || event.buttons !== 0) return;
    this.setHover(this.floorAtPoint(event.clientX, event.clientY));
  }

  private setHover(floorId: string | null): void {
    if (floorId === this.hoverFloor) return;
    this.hoverFloor = floorId;
    this.exterior.setHighlight(floorId);
    const canvas = this.renderer.domElement;
    if (floorId === null) canvas.style.removeProperty("cursor");
    else canvas.style.cursor = "pointer";
    this.requestRender();
  }

  /**
   * The real sun from Home Assistant (`sun.sun` azimuth and elevation, or computed from HA's location and time),
   * or null for the default sun. The house's North turns it onto the plan; shadows and day/night follow it.
   */
  /**
   * The glass reflection under the house on or off (Phase 21: off by default). Off, its pass is never drawn, so its
   * half-size target is never allocated on the GPU.
   */
  /** The stage this device's renderer draws behind the house (the screen draws it, 21.11). */
  backdrop(): Backdrop {
    return this.rendering.backdrop();
  }

  setReflection(enabled: boolean): void {
    this.stage.setReflectionVisible(enabled);
    this.requestRender();
  }

  setSolar(solar: Readonly<{ azimuthDeg: number; elevationDeg: number }> | null): void {
    const previous = this.solar;
    if (
      previous !== null &&
      solar !== null &&
      Math.abs(previous.azimuthDeg - solar.azimuthDeg) < 0.05 &&
      Math.abs(previous.elevationDeg - solar.elevationDeg) < 0.05
    )
      return;
    this.solar = solar;
    this.applySun();
  }

  private applySun(): void {
    const solar = this.solar;
    const house = this.shown?.house;
    if (solar !== null) {
      const north = house?.environment.northRotationDeg ?? 0;
      this.lighting.setSun(
        sunSettingsFromPosition(
          sunDirectionPlan(solar.azimuthDeg, solar.elevationDeg, north),
          solar.elevationDeg,
        ),
      );
    } else if (house !== undefined) {
      // No sun from Home Assistant: the house's own location and time, as in the builder.
      const result = environmentSun(house.environment, new Date());
      if (result.ok)
        this.lighting.setSun(sunSettingsFromPosition(result.sun.directionPlan, result.sun.elevationDeg));
    }
    // Exposure policy (lighting.ts): daylight scales the sky and the image-based fill; at night lamps dominate.
    const exposure = this.lighting.exposure();
    // From the lighting itself: a fixed (1/exposure − 1)/9 assumed the old gain of 10 and, after 14.2 lowered it to
    // 3, dimmed the daytime image-based fill to about a tenth (owner, 2026-11-18: the house looked too dark).
    const daylight = this.lighting.daylight();
    this.renderer.toneMappingExposure = exposure;
    this.mirrors.setReflectionScale(this.lighting.reflectionScale());
    this.scene.environmentIntensity = (0.35 * (0.15 + 0.85 * daylight)) / exposure;
    this.renderer.shadowMap.needsUpdate = true;
    this.requestRender();
  }

  /**
   * Light states from Home Assistant by light object ID. A light missing from the map (unmapped, or its entity
   * unknown or unavailable) is drawn off (Phase 7.9).
   */
  /**
   * Lights whose Shown when does not hold (Phase 21): their fixtures are not drawn or picked on any floor; the screen
   * also draws them off. Kept across floor switches and new objects.
   */
  setHiddenLights(lightIds: ReadonlySet<string>): void {
    this.hiddenLights = lightIds;
    this.exterior.setConcealedLights(lightIds);
    this.renderer.shadowMap.needsUpdate = true;
    this.requestRender();
  }

  setLightStates(states: ReadonlyMap<string, LightState>): void {
    this.lightStates = states;
    // Phase 16.6 timing (opt-in): time to the next frame and whether it compiled programs.
    const programs = (): number => this.renderer.info.programs?.length ?? 0;
    const measured = this.timing?.lightStates(programs());
    this.syncLights();
    if (measured !== undefined) this.afterRender.push(() => measured(programs()));
    this.requestRender();
  }

  /**
   * Live effect states from Home Assistant bindings by effect ID (Phase 8.4): inactive effects are hidden and
   * request no frames; an effect missing from the map plays as authored.
   */
  setEffectStates(states: ReadonlyMap<string, EffectLive>): void {
    this.effects.setLive(states);
  }

  /**
   * Shows (or with null clears) a picture on an object's screen (Phase 8.8); objects whose template declares no
   * screen ignore it. Renders one frame; the shadow maps are not redrawn (the picture casts no shadow).
   */
  setScreenImage(objectId: string, image: ScreenImage | null): void {
    this.screens.setImage(objectId, image);
    this.screens.sync(this.instances.root, this.instances.screen);
    this.requestRender();
  }

  /**
   * Live state-parameter values by object or opening ID (Phase 9.7): each is checked against the template's
   * declared state parameters and drawn instead of the stored value (house.json is untouched). Only instances
   * whose drawn parameters change are re-resolved; they ease to the new pose over 0.6 s (10.2, a jump with
   * reduced motion), and frames are rendered only until the last animation ends.
   */
  setInstanceStates(states: ReadonlyMap<string, Readonly<Record<string, HaStateValueValue>>>): void {
    this.instanceStates = states;
    this.syncInstances();
    this.requestRender();
  }

  /**
   * The live-state parameters an object's or opening's template declares (Phase 9.7, for the binding editor), or
   * null while its template is loading or when the ID is not on the shown floor.
   */
  stateParameters(instanceId: string): readonly TemplateStateParameter[] | null {
    const instance = this.shownFloor()
      ?.areas.flatMap((area) => [...area.objects, ...area.walls.flatMap((wall) => wall.objects)])
      .find((candidate) => candidate.id === instanceId);
    if (instance === undefined) return null;
    const state = this.templates.get(instance.templateId, instance.templateVersion);
    return state.state === "ready" ? templateStateParameterInfo(state.asset.metadata) : null;
  }

  /** Edit mode (D25): taps pick a light, object, or room for the binding editor; holds and double taps do nothing. */
  setEditMode(editing: boolean): void {
    this.editing = editing;
  }

  /** Rooms whose presence / intrusion is active now (Phase 8.6); an empty list stops every sweep. */
  setIntrusion(rooms: readonly IntrusionRoom[]): void {
    this.sweeps.setActive(rooms);
  }

  /**
   * Corner picking (Phase 8.6) on one room with its stored corners (undefined: the default two), or null to stop.
   * While it is on, a tap near one of the room's corners reports the toggled list (onCornerPick); nothing else runs.
   */
  setCornerPicking(picking: IntrusionRoom | null): void {
    this.cornerPickArea = picking?.areaId ?? null;
    this.sweeps.setPicking(picking);
  }

  setDarkMode(dark: boolean): void {
    this.stage.setPalette(dark ? darkStage : lightStage);
    this.requestRender();
  }

  resize(width: number, height: number): void {
    if (width === 0 || height === 0) return;
    this.orbit.setSize(width, height);
    this.renderer.setSize(width, height, false);
    const pixelRatio = this.renderer.getPixelRatio();
    this.stage.setSize(width * pixelRatio, height * pixelRatio);
    const reshaped = Math.abs(this.camera.aspect - width / height) > 0.001;
    this.camera.aspect = width / height;
    this.viewSize = { width, height };
    this.applyViewOffset();
    this.exterior.setResolution(width, height);
    // A floor switch's departing copy and camera are the old shape: the switch ends now (16.3).
    if (reshaped) this.dropDeparting();
    // The tight whole-floor fit (14.3) depends on the screen's shape.
    if (reshaped && this.shown !== null) this.reframeFloor();
    this.requestRender();
  }

  /** A tight depth range keeps the floors, carpets, and reflection apart at every zoom; it follows the distance. */
  private applyDepth(): void {
    const distance = this.orbit.distance;
    this.camera.near = Math.max(0.1, distance * 0.05);
    this.camera.far = Math.max(distance * 6, this.framing.distance * 3);
  }

  /** Shifts the view so the target sits centered in the part of the screen the insets leave free. */
  private applyViewOffset(): void {
    const { width, height } = this.viewSize;
    if (width === 0 || height === 0) return;
    const { left, right, top, bottom } = this.insets;
    this.camera.setViewOffset(
      width,
      height,
      (width * (right - left)) / 2,
      -height * (viewShiftDown * (1 - top - bottom) + (top - bottom) / 2),
      width,
      height,
    );
    this.camera.updateProjectionMatrix();
  }

  /**
   * Changes the part of the screen the room cards cover (their width changed, or the screen did), keeping the
   * camera where it is; the house glides into the new free area (14.4).
   */
  setRoomInsets(insets: FrameInsets): void {
    if (!this.focused || sameInsets(insets, this.move?.toInsets ?? this.insets)) return;
    const goal = this.cameraGoal();
    this.startMove({ ...goal, toInsets: insets, camera: true });
    this.requestRender();
  }

  /** Where the camera is heading: a running move's goal, else where it is (also after the view was grabbed). */
  private cameraGoal(): Readonly<{
    toTarget: Vector3;
    toDistance: number;
    toAzimuth: number;
    toPolar: number;
  }> {
    const move = this.move;
    if (move?.camera === true)
      return {
        toTarget: move.toTarget,
        toDistance: move.toDistance,
        toAzimuth: move.toAzimuth,
        toPolar: move.toPolar,
      };
    return {
      toTarget: this.orbit.target.clone(),
      toDistance: this.orbit.distance,
      toAzimuth: this.orbit.azimuth,
      toPolar: this.orbit.polar,
    };
  }

  /** The navigation mode from Settings → House (14.6): how the wheel reads; drags and touches work in every mode. */
  setNavigation(navigation: HaNavigationValue): void {
    this.navigation = navigation;
  }

  /**
   * Grabbing the view (a drag, a scroll, a pinch) stops the camera part of a spring move; the frame insets spring on,
   * so the house still settles beside the cards or widgets.
   */
  private grab(): void {
    const move = this.move;
    if (move?.camera !== true) return;
    this.move = { ...move, camera: false };
    const velocity = this.moveVelocity;
    velocity.target.set(0, 0, 0);
    velocity.distance = 0;
    velocity.azimuth = 0;
    velocity.polar = 0;
  }

  /**
   * The floor widgets' insets (13.7): while no room is open the whole floor is framed into the space they leave
   * (the house glides there); a room open keeps them for when it closes.
   */
  setFloorInsets(insets: FrameInsets): void {
    if (sameInsets(insets, this.floorInsets)) return;
    this.floorInsets = insets;
    this.reframeFloor();
  }

  /** The whole-floor framing fitted again (new insets or screen shape); the house glides there unless a room is open. */
  private reframeFloor(): void {
    this.framing = this.floorFraming();
    if (this.focused) return;
    const insets = this.floorInsets;
    // The angles stay; the fit is for them (a Top view or a turned view stays fitted, 14.6).
    const { toAzimuth, toPolar } = this.cameraGoal();
    const fit = this.floorFit(Math.PI / 2 - toPolar, toAzimuth);
    this.setDistanceLimits(fit.distance);
    this.startMove({
      toTarget: fit.center,
      toDistance: fit.distance,
      toAzimuth,
      toPolar,
      toInsets: insets,
      camera: true,
    });
  }

  /** Zoom limits: about 0.6× to 2.5× the floor framing, widened so a room or preset goal is always inside. */
  private setDistanceLimits(goal: number): void {
    this.orbit.limits.minDistance = Math.min(this.framing.distance * 0.6, goal * 0.5);
    this.orbit.limits.maxDistance = Math.max(this.framing.distance * 2.5, goal * 1.5);
  }

  /**
   * The view buttons (14.6, as the builder's camera buttons): **fit** returns to the framing (the whole floor at the
   * default angles; in a room, the room's framing), **top** looks straight down with the plan's axes reset (X right,
   * Y up), **turn** turns a quarter about the vertical; Top and the turn then fit (the floor, or the open room).
   */
  viewPreset(preset: ViewPreset): void {
    const from = this.cameraGoal();
    const room = this.roomGoal;
    let azimuth = from.toAzimuth + Math.PI / 2;
    let polar = from.toPolar;
    if (preset === "fit") {
      azimuth = room?.azimuth ?? (defaultAzimuthDeg * Math.PI) / 180;
      polar = room?.polar ?? defaultPolar;
    } else if (preset === "top") {
      azimuth = 0;
      polar = topPolar;
    }
    const fit =
      room === null
        ? this.floorFit(Math.PI / 2 - polar, azimuth)
        : { center: room.target.clone(), distance: room.distance };
    this.setDistanceLimits(fit.distance);
    this.startMove({
      toTarget: fit.center,
      toDistance: fit.distance,
      toAzimuth: from.toAzimuth + wrapAngle(azimuth - from.toAzimuth),
      toPolar: polar,
      toInsets: this.move?.toInsets ?? this.insets,
      camera: true,
    });
  }

  /** The camera as a saved room view: the orbit target in plan mm, the distance, and the orbit angles. */
  currentView(): HaAreaViewValue {
    this.planRoot.updateMatrixWorld(true);
    const target = this.planRoot.worldToLocal(this.orbit.target.clone());
    return {
      target: { x: target.x, y: target.y, h: target.z },
      distance: this.orbit.distance,
      azimuth: wrapAngle(this.orbit.azimuth),
      polar: this.orbit.polar,
    };
  }

  /**
   * Zooms to one area (to its saved view when given, else fitted to the room) framed into the part of the screen the
   * room cards leave (`roomInsets`: their side on a wide screen, the bottom sheet on a narrow one), or (null) returns
   * to the default view of the whole floor. The cards themselves belong to the screen.
   */
  focusArea(
    areaId: string | null,
    saved: HaAreaViewValue | null = null,
    roomInsets: FrameInsets = noInsets,
  ): void {
    const fromAzimuth = this.orbit.azimuth;
    const fromPolar = this.orbit.polar;
    let toTarget = this.framing.center.clone();
    let toDistance = this.framing.distance;
    let toInsets = this.floorInsets;
    let toAzimuth = (defaultAzimuthDeg * Math.PI) / 180;
    let toPolar = defaultPolar;
    if (areaId !== null) {
      // A room uses the whole view beside its cards; the floor widgets slide away meanwhile (13.7, 14.4).
      toInsets = roomInsets;
      if (saved !== null) {
        this.planRoot.updateMatrixWorld(true);
        toTarget = this.planRoot.localToWorld(new Vector3(saved.target.x, saved.target.y, saved.target.h));
        toDistance = saved.distance;
        toAzimuth = saved.azimuth;
        toPolar = saved.polar;
      } else {
        const bounds = this.floorScene.areaBounds(areaId);
        if (bounds === null) return;
        this.planRoot.updateMatrixWorld(true);
        toTarget = this.planRoot.localToWorld(
          new Vector3((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2, 1200),
        );
        // The walls' height counts too, or the room fills the view and its near walls hide it.
        const wallHeightMm = this.bounds?.maxHeightMm ?? 2700;
        const radius = Math.max(
          Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, wallHeightMm) / 2000,
          1,
        );
        // Fit the room into the free part of the screen, whichever of the two fields of view is tighter.
        const tanFull = Math.tan(((fovDeg / 2) * Math.PI) / 180);
        const halfV = Math.atan(tanFull * Math.max(1 - toInsets.top - toInsets.bottom, 0.2));
        const halfH = Math.atan(
          tanFull * this.camera.aspect * Math.max(1 - toInsets.left - toInsets.right, 0.2),
        );
        toDistance = Math.max((radius / Math.sin(Math.min(halfV, halfH))) * 1.2, 2);
        // Smart focus (Phase 8.2): the angle that sees the most of the floor, turning as little as needed.
        const chosen = this.focusView(areaId, bounds, toDistance, {
          azimuth: wrapAngle(fromAzimuth),
          polar: fromPolar,
        });
        toAzimuth = chosen.azimuth;
        toPolar = chosen.polar;
      }
    }
    // The cutaway (Phase 8.2a) clears the way into the open room, with a saved view too.
    this.cutaway.focus(areaId);
    this.focused = areaId !== null;
    this.setDistanceLimits(toDistance);
    // Turn the short way round (the spring works on the wrapped difference).
    const azimuthGoal = fromAzimuth + wrapAngle(toAzimuth - fromAzimuth);
    this.roomGoal =
      areaId === null
        ? null
        : { target: toTarget.clone(), distance: toDistance, azimuth: azimuthGoal, polar: toPolar };
    this.startMove({
      toTarget,
      toDistance,
      toAzimuth: azimuthGoal,
      toPolar,
      toInsets,
      camera: true,
    });
    this.requestRender();
  }

  /**
   * Smart focus (Phase 8.2): candidate orbit angles around the current one, scored by how many floor samples of the
   * room the eye sees past the walls and other rooms' objects (the room's own contents never block).
   */
  private focusView(
    areaId: string,
    bounds: Readonly<{ minX: number; minY: number; maxX: number; maxY: number }>,
    distanceM: number,
    from: OrbitView,
  ): OrbitView {
    const floor = this.shownFloor();
    const area = floor?.areas.find((candidate) => candidate.id === areaId);
    if (floor === null || area === undefined) return from;
    const walls: Occluder[] = this.floorScene
      .wallLayers()
      .flatMap((layer) => layer.walls.bands.map((band) => occluder(band.ring, 0, band.heightMm)));
    const objects: Occluder[] = [];
    this.planRoot.updateMatrixWorld(true);
    for (const other of floor.areas) {
      if (other.id === areaId) continue;
      for (const object of other.objects) {
        const root = this.instances.root(object.id);
        if (root === null) continue;
        const box = new Box3().setFromObject(root);
        if (box.isEmpty()) continue;
        const a = this.planRoot.worldToLocal(box.min.clone());
        const b = this.planRoot.worldToLocal(box.max.clone());
        const minX = Math.min(a.x, b.x);
        const maxX = Math.max(a.x, b.x);
        const minY = Math.min(a.y, b.y);
        const maxY = Math.max(a.y, b.y);
        const ring = [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ];
        objects.push(occluder(ring, Math.min(a.z, b.z), Math.max(a.z, b.z)));
      }
    }
    const choice = chooseView({
      target: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2, h: 1200 },
      distanceM,
      from,
      limits: { minPolar, maxPolar },
      samples: floorSamples(computeAreaFloorGeometry(area).floorShape, walls),
      occluders: [...walls, ...objects],
    });
    return choice?.view ?? from;
  }

  /** Sets a new goal; a move already running keeps its speed, so the camera flows on (no restart from rest). */
  private startMove(move: CameraMove): void {
    this.move = move;
    this.runCameraMove();
    this.requestRender();
  }

  /**
   * The camera move as one animation on the "camera" channel (15.3). While the house model is still being prepared
   * (15.1) nothing is drawn, so a move (the floor widgets' framing arriving early) lands at once: the house appears
   * already framed beside the widgets, which slide in meanwhile.
   */
  private runCameraMove(): void {
    const move = this.move;
    if (move === null) return;
    if (this.loadStage === "preparing" || this.revealPending) {
      if (move.camera) {
        this.orbit.target.copy(move.toTarget);
        this.orbit.distance = move.toDistance;
        this.orbit.azimuth = move.toAzimuth;
        this.orbit.polar = move.toPolar;
        this.orbit.apply();
      }
      this.insets = move.toInsets;
      this.move = null;
      this.moveVelocity = restingVelocity();
      this.applyDepth();
      this.applyViewOffset();
      return;
    }
    if (this.cameraAnimation?.status() === "active") return;
    this.lastMoveStep = performance.now();
    this.cameraAnimation = this.frames.start({
      channel: "camera",
      step: (now) => this.stepMove(now),
    });
  }

  /** Advances the camera move by springs to `now`; true while it is still settling. */
  private stepMove(now: number): boolean {
    const move = this.move;
    if (move === null) return false;
    // Frame-rate independent, stable for slow frames: at most 50 ms per call, in steps of up to 8 ms.
    let remaining = Math.min((now - this.lastMoveStep) / 1000, 0.05);
    this.lastMoveStep = now;
    const velocity = this.moveVelocity;
    const target = this.orbit.target.clone();
    let distance = this.orbit.distance;
    let azimuth = this.orbit.azimuth;
    let polar = this.orbit.polar;
    const insets = { ...this.insets };
    while (remaining > 1e-6) {
      const dt = Math.min(remaining, 0.008);
      remaining -= dt;
      for (const side of insetSides)
        [insets[side], velocity.insets[side]] = springStep(
          insets[side],
          velocity.insets[side],
          move.toInsets[side],
          springOmega.insets,
          dt,
        );
      // A grabbed view (14.6): the hand holds the camera; only the insets go on.
      if (!move.camera) continue;
      for (const axis of ["x", "y", "z"] as const) {
        const [value, speed] = springStep(
          target[axis],
          velocity.target[axis],
          move.toTarget[axis],
          springOmega.target,
          dt,
        );
        target[axis] = value;
        velocity.target[axis] = speed;
      }
      [distance, velocity.distance] = springStep(
        distance,
        velocity.distance,
        move.toDistance,
        springOmega.distance,
        dt,
      );
      const azimuthGoal = azimuth + wrapAngle(move.toAzimuth - azimuth);
      [azimuth, velocity.azimuth] = springStep(
        azimuth,
        velocity.azimuth,
        azimuthGoal,
        springOmega.azimuth,
        dt,
      );
      [polar, velocity.polar] = springStep(polar, velocity.polar, move.toPolar, springOmega.polar, dt);
    }
    if (move.camera) {
      // Within the orbit limits, widened to the goal and the start (Top view looks straight down, 14.6), so leaving
      // Top view glides instead of jumping to the limit.
      const low = Math.min(minPolar, move.toPolar, this.orbit.polar);
      const high = Math.max(maxPolar, move.toPolar, this.orbit.polar);
      polar = Math.min(Math.max(polar, low), high);
      this.orbit.target.copy(target);
      this.orbit.distance = distance;
      this.orbit.azimuth = azimuth;
      this.orbit.polar = polar;
      this.orbit.apply();
    }
    this.insets = insets;
    this.applyDepth();
    this.applyViewOffset();
    // Settled: close to every goal and nearly still (1 mm, 0.05°, 0.1% of the panel).
    const cameraSettled =
      !move.camera ||
      (target.distanceTo(move.toTarget) < 0.001 &&
        velocity.target.length() < 0.001 &&
        Math.abs(distance - move.toDistance) < 0.001 &&
        Math.abs(wrapAngle(move.toAzimuth - azimuth)) < 0.001 &&
        Math.abs(move.toPolar - polar) < 0.001 &&
        Math.abs(velocity.distance) + Math.abs(velocity.azimuth) + Math.abs(velocity.polar) < 0.002);
    const settled = cameraSettled && sameInsets(insets, move.toInsets);
    if (settled) {
      this.move = null;
      this.moveVelocity = restingVelocity();
    }
    return this.move !== null;
  }

  /**
   * The free part of the screen the floor widgets leave (13.7), as view tangents around the view axis: the view
   * offset centres it horizontally and shifts the target down by `viewShiftDown` (applyViewOffset), so the window
   * reaches less far below the target than above it.
   */
  private floorWindow(): FrameWindow {
    const free = this.floorInsets;
    const tanFull = Math.tan(((fovDeg / 2) * Math.PI) / 180);
    const tanV = tanFull * Math.max(1 - free.top - free.bottom, 0.2);
    const tanH = tanFull * Math.max(this.camera.aspect, 0.1) * Math.max(1 - free.left - free.right, 0.2);
    return {
      left: tanH,
      right: tanH,
      bottom: tanV * (1 - 2 * viewShiftDown),
      top: tanV * (1 + 2 * viewShiftDown),
    };
  }

  /**
   * The default framing (14.3, owner: about 20 % closer than the box fit): the floor's real outline from the default
   * angles fitted into the free screen with a 4 % margin (floorFraming.ts), the target slid off the box centre only as
   * far as the outline needs.
   */
  private floorFraming(): { center: Vector3; distance: number } {
    return this.floorFit((defaultElevationDeg * Math.PI) / 180, (defaultAzimuthDeg * Math.PI) / 180);
  }

  /** The floor's outline fitted into the free screen seen from these angles (the default framing's fit, 14.3). */
  private floorFit(elevation: number, azimuth: number): { center: Vector3; distance: number } {
    const { heightM } = this.floorSize();
    const outline = this.outline.length > 0 ? this.outline : this.outlinePoints();
    const fit: FloorFit = fitFloor(outline, elevation, azimuth, this.floorWindow());
    const axes = cameraAxes(elevation, azimuth);
    const center = new Vector3(
      fit.shiftRight * axes.right.x + fit.shiftUp * axes.up.x,
      heightM / 2 + fit.shiftRight * axes.right.y + fit.shiftUp * axes.up.y,
      fit.shiftRight * axes.right.z + fit.shiftUp * axes.up.z,
    );
    return { center, distance: fit.distance };
  }

  /**
   * The floor's outline in world metres around its box centre: every floor shape's corners at floor level and every
   * wall band's corners at floor level and at the band's height; a 10 × 10 × 3 m box before a floor is shown.
   */
  private outlinePoints(): FramePoint[] {
    const { heightM } = this.floorSize();
    const center = this.planCenter();
    const points: FramePoint[] = [];
    const add = (x: number, y: number, heightMm: number): void => {
      points.push({ x: (x - center.x) / 1000, y: heightMm / 1000 - heightM / 2, z: -(y - center.y) / 1000 });
    };
    for (const point of this.houseView()?.framePoints() ?? []) add(point.x, point.y, point.h);
    for (const area of this.shownFloor()?.areas ?? [])
      for (const polygon of computeAreaFloorGeometry(area).floorShape.polygons)
        for (const corner of polygon.outer) add(corner.x, corner.y, 0);
    for (const layer of this.floorScene.wallLayers())
      for (const band of layer.walls.bands)
        for (const corner of band.ring) {
          add(corner.x, corner.y, 0);
          add(corner.x, corner.y, band.heightMm);
        }
    if (points.length > 0) return points;
    const box: FramePoint[] = [];
    for (const x of [-5, 5]) for (const y of [-1.5, 1.5]) for (const z of [-5, 5]) box.push({ x, y, z });
    return box;
  }

  /** The floor's box in metres (a 10 × 10 × 3 m stand-in before a floor is shown). */
  private floorSize(): Readonly<{ widthM: number; depthM: number; heightM: number }> {
    const bounds = this.bounds;
    return {
      widthM: bounds === null ? 10 : (bounds.maxX - bounds.minX) / 1000,
      depthM: bounds === null ? 10 : (bounds.maxY - bounds.minY) / 1000,
      heightM: bounds === null ? 3 : bounds.maxHeightMm / 1000,
    };
  }

  /**
   * Default framing: the whole floor (or house) at a fixed elevation and azimuth; with `angles` (a floor switch,
   * 16.3) at those angles instead, fitted the same way.
   */
  frame(angles: Readonly<{ azimuth: number; polar: number }> | null = null): void {
    const { widthM, depthM, heightM } = this.floorSize();
    const radius = Math.max(Math.hypot(widthM, depthM, heightM) / 2, 1);
    this.stage.setFadeRadius(radius * 1.6);
    const elevation = angles === null ? (defaultElevationDeg * Math.PI) / 180 : Math.PI / 2 - angles.polar;
    const azimuth = angles === null ? (defaultAzimuthDeg * Math.PI) / 180 : angles.azimuth;
    this.framing = this.floorFraming();
    const { center, distance } = angles === null ? this.framing : this.floorFit(elevation, azimuth);
    this.move = null;
    this.cameraAnimation?.cancel();
    this.moveVelocity = restingVelocity();
    this.focused = false;
    this.roomGoal = null;
    this.insets = this.floorInsets;
    // Panning keeps the target near the house: within its half-diagonal + 1 m, from below the floor to above it.
    this.orbit.centre.set(0, heightM / 2, 0);
    this.orbit.reachM = Math.max(Math.hypot(widthM, depthM) / 2, 2) + 1;
    this.orbit.floorM = -1;
    this.orbit.ceilingM = heightM + 4;
    this.orbit.target.copy(center);
    this.orbit.distance = distance;
    this.orbit.azimuth = azimuth;
    this.orbit.polar = Math.PI / 2 - elevation;
    this.orbit.apply();
    this.setDistanceLimits(distance);
    this.applyDepth();
    this.applyViewOffset();

    this.renderer.shadowMap.needsUpdate = true;
    this.requestRender();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.slide?.cancel();
    this.endRide();
    this.stageToken += 1;
    this.visibility.dispose();
    this.frames.dispose();
    this.loadQueue.dispose();
    this.clearStageTimers();
    for (const upload of this.uploads) upload.resolve();
    this.uploads.length = 0;
    this.releaseTwins();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.handlePointerDown);
    canvas.removeEventListener("pointermove", this.handlePointerMove);
    canvas.removeEventListener("pointerup", this.handlePointerUp);
    canvas.removeEventListener("pointercancel", this.handlePointerUp);
    canvas.removeEventListener("pointermove", this.handleHover);
    canvas.removeEventListener("pointerleave", this.handleLeave);
    canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);
    this.drags.dispose();
    this.navigationInput.dispose();
    if (this.press !== null) window.clearTimeout(this.press.holdTimer);
    this.taps.dispose();
    this.effects.dispose();
    this.screens.dispose();
    this.sweeps.dispose();
    this.lighting.dispose();
    this.lights.dispose();
    this.sky.dispose();
    this.helperMaterials.dispose();
    this.emptyInstances.dispose();
    this.floorRoofs.dispose();
    this.exterior.dispose();
    this.mirrors.dispose();
    this.templates.dispose();
    this.emptyScene.dispose();
    this.materials.dispose();
    this.textures.dispose();
    this.stage.dispose();
    this.scene.environment?.dispose();
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private planCenter(): Readonly<{ x: number; y: number }> {
    const bounds = this.bounds;
    return bounds === null
      ? { x: 0, y: 0 }
      : { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  }

  /**
   * Places doors, windows, objects, and fixtures (with live states, 9.7), then assigns surface materials. Objects
   * added while loading (15.1) redraw the shadow maps throttled; every other change redraws them in the next frame.
   */
  private syncInstances(shadows: "now" | "throttled" = "now"): void {
    const floor = this.statedFloor(this.shownFloor());
    this.animateStates(floor);
    // The shown floors' content with its live states (21.4: the house's one copy; in the whole house every floor,
    // whose states jump, without animation).
    this.emitters = this.exterior.syncContent((each) => this.statedFloor(each) ?? each);
    this.exterior.setConcealedLights(this.hiddenLights);
    this.floorRoofs.refresh();
    this.effects.sync(floor, this.instances.root);
    this.screens.sync(this.instances.root, this.instances.screen);
    this.syncLights(shadows);
    this.applyMaterials();
    this.collectUnreflected();
    this.requestShadows(shadows);
    this.scheduleBatch(batchQuietMs);
    // Shadow flags come from the builder's layers: walls and objects cast, floors and carpets only receive.
  }

  /**
   * The whole house merged (18.1, staticBatch.ts): once loading is done and nothing changed for a while, one floor
   * per step, the likely floor first. A sync that changes a floor drops its batch at once and merges it again later.
   */
  private scheduleBatch(wait: number): void {
    if (this.houseView() === null || this.loadStage !== "done" || this.disposed) return;
    window.clearTimeout(this.batchTimer);
    this.batchTimer = window.setTimeout(() => {
      this.batchTimer = 0;
      this.batchStep();
    }, wait);
  }

  private batchStep(): void {
    const house = this.houseView();
    if (house === null || this.loadStage !== "done" || this.disposed) return;
    const started = performance.now();
    if (!house.rebatch()) return;
    const stats = house.batchStats();
    this.timing?.note(
      `merged a floor (${String(stats.sources)} meshes in ${String(stats.batches)} draws so far)`,
      performance.now() - started,
    );
    this.collectUnreflected();
    this.requestRender();
    this.scheduleBatch(batchStepMs);
  }

  /**
   * Starts or retargets state animations (10.2) for objects and openings whose drawn parameters changed, and
   * hands the instance layer the poses for now (before it rebuilds changed instances, so they start where they
   * were). Instances whose template is not loaded are left out, so a template that loads with a live state
   * shows it at once.
   */
  private animateStates(floor: BuildingFloorValue | null): void {
    const targets = new Map<string, Readonly<Record<string, number | boolean | string>>>();
    for (const area of floor?.areas ?? [])
      for (const instance of [...area.objects, ...area.walls.flatMap((wall) => wall.objects)])
        if (this.placed.get(instance.templateId, instance.templateVersion).state === "ready")
          targets.set(instance.id, instance.parameters);
    const now = performance.now();
    this.stateAnimator.update(targets, now, !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const poses = this.stateAnimator.poses(now);
    this.posing = poses.size > 0;
    this.instances.setPoses(poses);
    // One animation on the "states" channel steps every instance's pose (15.3): it ends when the last pose has
    // settled, and camera input never cancels it.
    if (this.posing && this.statesAnimation?.status() !== "active")
      this.statesAnimation = this.frames.start({
        channel: "states",
        step: (frameNow) => this.stepStates(frameNow),
      });
  }

  /** Advances the state animations to `now` (10.2); true while one is still running. */
  private stepStates(now: number): boolean {
    if (!this.posing) return false;
    const poses = this.stateAnimator.poses(now);
    this.posing = poses.size > 0;
    // A part shown or hidden at the midpoint rebuilds its instance: place it and assign materials again.
    if (this.instances.setPoses(poses)) this.syncInstances();
    else this.renderer.shadowMap.needsUpdate = true;
    return this.posing;
  }

  /** Surface materials of the floor scene and the instances (fades from isolation and the cutaway). */
  private applyMaterials(): void {
    this.materials.begin();
    this.floorScene.applyMaterials();
    this.floorRoofs.applyMaterials();
    this.exterior.applyMaterials();
    // Doors and windows on the open room's near walls fade with them (8.2a, A). A neighbour's door or window in a
    // wall the open room shares draws as the room's own and fades with the room's near wall there (15.7,
    // floorScene.entityFade).
    this.instances.applyMaterials((areaId, entityId) =>
      strongerFade(
        this.floorScene.entityFade(areaId, entityId),
        this.cutaway.wallFade(this.openingWalls.get(entityId)),
      ),
    );
    this.materials.sweep();
    this.cutaway.afterMaterials();
  }

  private shownFloor(): BuildingFloorValue | null {
    const shown = this.shown;
    return shown?.house.floors.find((candidate) => candidate.id === shown.floorId) ?? null;
  }

  /** Draws the lights with HA states applied; unchanged lights keep their identity, so only changed ones rebuild. */
  private syncLights(shadows: "now" | "throttled" = "now"): void {
    const house = this.houseView();
    // The whole house (18.1): one lights layer for every floor's lights, one topology and one shadow budget.
    const floors = house?.contentFloors() ?? [];
    const [firstFloor] = floors;
    const floor =
      house === null
        ? this.shownFloor()
        : firstFloor === undefined
          ? null
          : { ...firstFloor, areas: floors.flatMap((each) => each.areas) };
    // Every light is drawn from HA: its state when mapped, off when not (a live view shows no invented light).
    const effective =
      floor === null
        ? floor
        : {
            ...floor,
            areas: floor.areas.map((area) =>
              area.lights.length === 0
                ? area
                : { ...area, lights: area.lights.map((light) => this.statedLight(light)) },
            ),
          };
    this.lights.sync(effective, this.exterior.areaGroup, this.emitters);
    this.exterior.setFixtureGlow(this.lights.fixtureGlow());
    // Lights cast shadows so walls confine them (Phase 7.10); the maps are redrawn on the next frame only.
    this.requestShadows(shadows);
  }

  /**
   * The floor with live state parameters laid over the stored ones (9.7). Unaffected areas, objects, and openings
   * keep their identity, so the instance layer rebuilds only the instances whose drawn parameters changed.
   */
  private statedFloor(floor: BuildingFloorValue | null): BuildingFloorValue | null {
    if (floor === null || this.instanceStates.size === 0) {
      this.statedObjects.clear();
      this.statedOpenings.clear();
      return floor;
    }
    const stated = <T extends StatedInstance>(instance: T, cache: StatedCache<T>): T => {
      const live = this.instanceStates.get(instance.id);
      if (live === undefined) return instance;
      const template = this.placed.get(instance.templateId, instance.templateVersion);
      if (template.state !== "ready") return instance;
      const parameters = parametersWithLiveStates(
        instance.parameters,
        templateStateParameterInfo(template.asset.metadata),
        live,
      );
      if (parameters === instance.parameters) return instance;
      const key = JSON.stringify(parameters);
      const cached = cache.get(instance.id);
      if (cached?.source === instance && cached.key === key) return cached.value;
      const value: T = { ...instance, parameters };
      cache.set(instance.id, { source: instance, key, value });
      return value;
    };
    const areas = floor.areas.map((area): AreaValue => {
      const objects = area.objects.map((object) => stated(object, this.statedObjects));
      const walls = area.walls.map((wall) => {
        const openings = wall.objects.map((opening) => stated(opening, this.statedOpenings));
        return openings.every((opening, index) => opening === wall.objects[index])
          ? wall
          : { ...wall, objects: openings };
      });
      if (
        objects.every((object, index) => object === area.objects[index]) &&
        walls.every((wall, index) => wall === area.walls[index])
      )
        return area;
      return { ...area, objects, walls };
    });
    return areas.every((area, index) => area === floor.areas[index]) ? floor : { ...floor, areas };
  }

  private statedLight(light: LightValue): LightValue {
    const state = this.lightStates.get(light.id) ?? lightOff;
    const cached = this.stated.get(light.id);
    if (cached?.source === light && cached.state === state) return cached.value;
    const value = withState(light, state);
    this.stated.set(light.id, { source: light, state, value });
    return value;
  }

  /**
   * What a tap at a screen point means (Phase 8.1), through the ordered pick pipeline: bubble → light → object →
   * room. Bubbles are HTML and take their own pointer events before the canvas sees any (bubbleOverlay.ts), so
   * the canvas pipeline starts at the lights. Objects answer when they take gestures (8.3), or every object in
   * Edit mode (`allObjects`); any other object is looked past to its room. Surfaces the cutaway removed or
   * faded are looked through.
   */
  private pick(clientX: number, clientY: number, allObjects = false, openings = false): ViewerPick | null {
    const hits = this.hitsAt(clientX, clientY).filter((hit) => !this.cutaway.looksThrough(hit));
    const areas = this.shownFloor()?.areas ?? [];
    const lightIds = new Set(areas.flatMap((area) => area.lights.map((light) => light.id)));
    // Doors and windows answer like objects: by their own instance geometry, when they take gestures (10.1),
    // or all of them for the binding editor (their state parameters bind like an object's, 9.7).
    const objectIds = new Set(
      areas.flatMap((area) => [
        ...area.objects.map((object) => object.id).filter((id) => allObjects || this.objectActs(id)),
        ...area.walls
          .flatMap((wall) => wall.objects.map((opening) => opening.id))
          .filter((id) => openings || this.objectActs(id)),
      ]),
    );
    const wallTargets = this.floorScene.pickTargets();
    const stages: PickStage[] = [
      lightPickStage(lightIds),
      objectPickStage(objectIds),
      roomStage(this.volumes, (hit) => wallTargets.get(hit.object)?.(hit) ?? null),
    ];
    return runPickStages(stages, { hits, ray: this.planRay() });
  }

  /** The raycaster's current ray in plan mm (after hitsAt has set it). */
  private planRay(): PlanRay {
    this.planRoot.updateMatrixWorld(true);
    const ray = this.raycaster.ray;
    const origin = this.planRoot.worldToLocal(ray.origin.clone());
    const ahead = this.planRoot.worldToLocal(ray.origin.clone().add(ray.direction));
    return {
      origin: { x: origin.x, y: origin.y, h: origin.z },
      direction: { x: ahead.x - origin.x, y: ahead.y - origin.y, h: ahead.z - origin.z },
    };
  }

  /** Every visible surface under a screen point, nearest first. */
  private hitsAt(clientX: number, clientY: number): Intersection[] {
    const canvas = this.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return [];
    const ndc = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObject(this.planRoot, true).filter((candidate) => drawn(candidate.object));
  }

  /** Edit mode: the light, else the object, else the room under a screen point (through the 8.1 pipeline). */
  private editPickAt(clientX: number, clientY: number): EditPick | null {
    const pick = this.pick(clientX, clientY, true, true);
    if (pick === null) return null;
    if (pick.kind === "light") return { kind: "lights", id: pick.lightId };
    if (pick.kind === "object") return { kind: "objects", id: pick.objectId };
    return { kind: "areas", id: pick.areaId };
  }

  private pointerDown(event: PointerEvent): void {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    this.downPointers.add(event.pointerId);
    if (this.press !== null) {
      window.clearTimeout(this.press.holdTimer);
      // A second finger (14.6): the gesture pans or pinches; neither finger taps or holds.
      if (this.downPointers.size > 1) {
        this.press.moved = true;
        return;
      }
    }
    const press: Press = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      held: false,
      holdTimer: 0,
    };
    press.holdTimer = window.setTimeout(() => {
      if (press.moved || this.editing || this.houseView() !== null) return;
      press.held = true;
      const target = gestureTargetOf(this.pick(press.x, press.y));
      if (target !== null) this.onGesture(target, "hold");
    }, gestureTiming.holdMs);
    this.press = press;
  }

  private pointerMove(event: PointerEvent): void {
    const press = this.press;
    if (press === null || press.moved || press.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > gestureTiming.tapSlopPx) {
      press.moved = true;
      window.clearTimeout(press.holdTimer);
    }
  }

  private pointerUp(event: PointerEvent): void {
    this.downPointers.delete(event.pointerId);
    const press = this.press;
    if (press?.pointerId !== event.pointerId) return;
    this.press = null;
    window.clearTimeout(press.holdTimer);
    // A drag never taps (14.6): past the slop, or part of a two-finger pan / pinch.
    if (
      press.moved ||
      press.held ||
      event.type === "pointercancel" ||
      this.drags.pressDragged(event.pointerId)
    )
      return;
    // The whole-house view (16.1) only selects floors, in Edit mode too: a tap on a floor opens it.
    if (this.houseView() !== null) {
      const floorId = this.floorAtPoint(event.clientX, event.clientY);
      if (floorId === null) this.tap(null);
      else {
        this.setHover(null);
        this.onFloorSelect(floorId);
      }
      return;
    }
    const cornerArea = this.cornerPickArea;
    if (cornerArea !== null) {
      const corners = this.sweeps.pickCorner(event.clientX, event.clientY);
      if (corners !== null) this.onCornerPick(cornerArea, corners);
      return;
    }
    if (this.editing) {
      if (this.onEditTap(event.clientX, event.clientY)) return;
      const editPick = this.editPickAt(event.clientX, event.clientY);
      if (editPick !== null) this.onEditPick(editPick);
      return;
    }
    const pick = this.pick(event.clientX, event.clientY);
    if (pick?.kind === "room") {
      this.onAreaSelect(pick.areaId);
      return;
    }
    this.tap(gestureTargetOf(pick));
  }

  /**
   * A tap on a light or an object (or on nothing). Two quick taps on the same target: its double tap; on nothing
   * it reframes (or closes the open room).
   */
  private tap(target: GestureTarget | null): void {
    this.taps.tap(
      target,
      target === null || this.hasDoubleTap(target),
      () => {
        if (target === null) return;
        this.onGesture(target, "tap");
      },
      () => {
        if (target === null) {
          if (this.focused) this.onAreaDismiss();
          else this.frame();
        } else if (this.hasDoubleTap(target)) this.onGesture(target, "doubleTap");
      },
    );
  }

  // ---- bubbles (Phase 8.5) ----------------------------------------------

  /** A plan point (mm) on screen, in CSS px of the canvas; null behind the camera or outside the depth range. */
  project(point: PlanPoint3): ScreenPoint | null {
    const { width, height } = this.viewSize;
    if (width === 0 || height === 0) return null;
    const ndc = this.planRoot.localToWorld(new Vector3(point.x, point.y, point.h)).project(this.camera);
    if (ndc.z < -1 || ndc.z > 1) return null;
    return { x: ((ndc.x + 1) / 2) * width, y: ((1 - ndc.y) / 2) * height };
  }

  /**
   * Where a placed bubble sits now (plan mm): above its object's top, at its light's emitter (hidden lights
   * too), or its point; null when the thing (or the point's room) is not drawn, so hidden rooms and objects hide
   * their bubbles (Phase 7.5).
   */
  anchorPoint(anchor: HaBubbleAnchorValue): PlanPoint3 | null {
    const areas = this.shownFloor()?.areas ?? [];
    if (anchor.kind === "point")
      return areas.some((area) => area.id === anchor.areaId) ? anchor.positionMm : null;
    if (anchor.kind === "light") {
      const emitter = this.emitters.get(anchor.lightId);
      if (emitter !== undefined) return emitter;
      const light = areas.flatMap((area) => area.lights).find((candidate) => candidate.id === anchor.lightId);
      return light === undefined ? null : { ...light.positionMm, h: light.elevationMm };
    }
    if (!areas.some((area) => area.objects.some((object) => object.id === anchor.objectId))) return null;
    // `bounds` maps world positions to plan by scale only, so it still carries this viewer's centring shift of
    // the plan root (placeRoots); taking them back through the plan root gives the true plan corners.
    const worldCorners = this.instances.bounds(anchor.objectId);
    if (worldCorners === null || worldCorners.length === 0) return null;
    this.planRoot.updateMatrixWorld();
    const corners = worldCorners.map((corner) => {
      const local = this.planRoot.worldToLocal(planToWorld(corner));
      return { x: local.x, y: local.y, h: local.z };
    });
    const top = corners.length >= 8 ? corners.slice(4) : corners;
    return {
      x: top.reduce((sum, corner) => sum + corner.x, 0) / top.length,
      y: top.reduce((sum, corner) => sum + corner.y, 0) / top.length,
      h: Math.max(...corners.map((corner) => corner.h)) + objectBubbleLiftMm,
    };
  }

  /** A shown room's bubble frame (above its highest wall, along its longest side); null for hidden rooms. */
  roomFrame(areaId: string): RoomFrame | null {
    const volume = this.volumes.find((candidate) => candidate.areaId === areaId);
    return volume === undefined ? null : roomFrame(volume.region, volume.topMm);
  }

  /**
   * Where a bubble placed at a screen point goes (Edit mode, 8.5): onto a light whose emitter is within
   * `lightSnapPx` (hidden lights too) or whose fixture is under it, else the object under it, else a free point
   * just above the surface tapped (or at mid-height of the room volume the ray enters) in that room.
   */
  placeAt(clientX: number, clientY: number): HaBubbleAnchorValue | null {
    // Lights without a drawn fixture (hidden, or fixture-less) are caught near their emitter on screen.
    const rect = this.renderer.domElement.getBoundingClientRect();
    const near = (this.shownFloor()?.areas ?? [])
      .flatMap((area) => area.lights)
      .map((light) => {
        const point = this.anchorPoint({ kind: "light", lightId: light.id });
        const screen = point === null ? null : this.project(point);
        const distance =
          screen === null
            ? Number.POSITIVE_INFINITY
            : Math.hypot(screen.x - (clientX - rect.left), screen.y - (clientY - rect.top));
        return { id: light.id, distance };
      })
      .filter((candidate) => candidate.distance <= lightSnapPx)
      .sort((a, b) => a.distance - b.distance)[0];
    const pick = this.pick(clientX, clientY, true);
    if (near !== undefined && pick?.kind !== "object") return { kind: "light", lightId: near.id };
    if (pick === null) return null;
    if (pick.kind === "light") return { kind: "light", lightId: pick.lightId };
    if (pick.kind === "object") return { kind: "object", objectId: pick.objectId };
    const hit = this.hitsAt(clientX, clientY).find((candidate) => !this.cutaway.looksThrough(candidate));
    this.planRoot.updateMatrixWorld(true);
    if (hit !== undefined) {
      const local = this.planRoot.worldToLocal(hit.point.clone());
      return {
        kind: "point",
        areaId: pick.areaId,
        positionMm: { x: local.x, y: local.y, h: Math.max(local.z, 0) + placedLiftMm },
      };
    }
    const volume = this.volumes.find((candidate) => candidate.areaId === pick.areaId);
    const heightMm = volume === undefined ? 1200 : (volume.bottomMm + volume.topMm) / 2;
    const world = this.planRoot.localToWorld(new Vector3(0, 0, heightMm));
    const point = this.raycaster.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -world.y), new Vector3());
    if (point === null) return null;
    const local = this.planRoot.worldToLocal(point);
    return { kind: "point", areaId: pick.areaId, positionMm: { x: local.x, y: local.y, h: heightMm } };
  }

  /** The template kind of a placed object (`airConditioner`, …) once its template has loaded, else null. */
  objectKind(objectId: string): string | null {
    const object = this.shownFloor()
      ?.areas.flatMap((area) => area.objects)
      .find((candidate) => candidate.id === objectId);
    if (object === undefined) return null;
    const state = this.templates.get(object.templateId, object.templateVersion);
    return state.state === "ready" ? state.asset.metadata.kind : null;
  }

  private reportTilt(): void {
    const tilt = this.orbit.polar - defaultPolar;
    if (Math.abs(tilt - this.lastTilt) < 0.0005) return;
    this.lastTilt = tilt;
    this.onTilt(tilt);
  }

  /** Areable objects and lights (everything but wall openings) by their instance group names. */
  private collectUnreflected(): void {
    const names = new Set([
      // The whole house's merged objects (18.1) stay out of the reflection like the objects themselves.
      batchBucketName("objects"),
      ...this.contentFloors()
        .flatMap((floor) => floor.areas)
        .flatMap((area) => [
          ...area.objects.map((object) => `instance:${object.id}`),
          ...area.lights.map((light) => `instance:${light.id}`),
        ]),
    ]);
    const found: Object3D[] = [];
    this.planRoot.traverse((child) => {
      if (names.has(child.name)) found.push(child);
    });
    this.unreflected = found;
  }

  /** Hands the framed insets to `onInsets` when they changed since the last frame (the backdrop follows, 14.5). */
  private reportInsets(): void {
    const reported = this.reportedInsets;
    if (reported !== null && sameInsets(reported, this.insets)) return;
    this.reportedInsets = this.insets;
    this.onInsets(this.insets);
  }

  /**
   * Renders on demand (15.3): one frame is requested, coalesced with every other request until it runs. Animations
   * (the camera move, state changes, asset work) keep frames coming through the scheduler while they are active.
   */
  private requestRender(): void {
    if (this.disposed) return;
    this.frames.invalidate();
  }

  /** A floor's shadow lamps: the GPU's budget, or the prototype's low limit (21.6). */
  private floorShadowBudget(): number {
    const budget = shadowBudget(this.renderer.capabilities.maxTextures);
    const lamps = this.rendering.limits().floorShadowLamps;
    return lamps === null ? budget : Math.min(budget, lamps);
  }

  /**
   * Dev readout (Phase 21.1): GPU resources, the last frame's draw calls, the pixel ratio and drawing buffer, an
   * estimate of the shadow maps' memory (no browser API reports GPU memory), and the slowest render since the last
   * call (which resets it).
   */
  debugStats(): string {
    const info = this.renderer.info;
    let shadowMb = 0;
    this.scene.traverse((object) => {
      if (!(object instanceof Light) || !object.castShadow) return;
      const shadow: unknown = Reflect.get(object, "shadow");
      if (!(shadow instanceof LightShadow) || shadow.map === null) return;
      const size = shadow.mapSize;
      shadowMb += (size.x * size.y * (object instanceof PointLight ? 6 : 1) * 8) / 1e6;
    });
    const canvas = this.renderer.domElement;
    const worst = this.worstRenderMs;
    this.worstRenderMs = 0;
    return `geo ${String(info.memory.geometries)} · tex ${String(info.memory.textures)} · prog ${String(
      info.programs?.length ?? 0,
    )} · calls ${String(info.render.calls)} · dpr ${String(this.renderer.getPixelRatio())} ${String(
      canvas.width,
    )}×${String(canvas.height)} · shadows ~${String(Math.round(shadowMb))} MB · worst ${worst.toFixed(0)} ms · ${
      this.rendering.id
    }`;
  }

  /** One frame: the animations have stepped; uploads, shadows, and the render follow. */
  private renderFrame(now: number): void {
    this.reportInsets();
    // While the house model is prepared (15.1) nothing is drawn: the canvas stays clear over the backdrop.
    if (this.loadStage === "preparing") return;
    this.flushShadows(now);
    const shadows = this.renderer.shadowMap.needsUpdate;
    if (shadows) this.lastShadowAt = now;
    const started = performance.now();
    this.drawScene();
    const renderMs = performance.now() - started;
    this.worstRenderMs = Math.max(this.worstRenderMs, renderMs);
    this.timing?.frame(renderMs, shadows, this.lastFrameAt === null ? null : now - this.lastFrameAt);
    // Gaps are measured between frames that follow each other; an idle pause is not a dropped frame.
    this.lastFrameAt = this.frames.active() ? now : null;
    this.reportTilt();
    this.onRender();
    this.onFrame();
    if (this.revealPending) this.reveal();
    const after = this.afterRender;
    this.afterRender = [];
    for (const run of after) run();
  }

  /**
   * Draws the scene once. During a floor switch (16.3, 16.13) the camera is placed along the move for this frame, the
   * destination is drawn, then the departing copy with the same camera, blended over it with weight 1 − progress.
   * Only the camera moves: the floors, their lights, and the sun stay where their static shadow maps were drawn
   * (7.10), so no shadow is redrawn during the move.
   */
  private drawScene(): void {
    this.cutaway.update(this.camera.position);
    this.effects.beforeRender();
    this.sweeps.beforeRender();
    this.sky.beforeRender();
    this.lights.beforeRender(this.scene);
    const ride = this.ride;
    const progress = this.slideProgress;
    if (ride === null || progress === null) {
      this.rendering.draw({ renderer: this.renderer, scene: this.scene, camera: this.camera });
      return;
    }
    const resting = this.placeSlideCamera(ride, progress);
    this.rendering.draw({ renderer: this.renderer, scene: this.scene, camera: this.camera });
    this.restoreCamera(resting);
  }

  // ---- shadows (static maps, Phase 7.10; throttled while objects load, 15.1) -------------------------------

  private requestShadows(mode: "now" | "throttled"): void {
    if (mode === "now" || this.loadStage !== "loading") {
      this.renderer.shadowMap.needsUpdate = true;
      return;
    }
    this.shadowsDue = true;
    this.requestRender();
  }

  /** Turns an owed throttled shadow redraw into this frame's, or wakes a frame when it is due. */
  private flushShadows(now: number): void {
    if (!this.shadowsDue) return;
    const wait = this.loadStage === "loading" ? this.lastShadowAt + loadingShadowGapMs - now : 0;
    if (wait <= 0) {
      this.shadowsDue = false;
      this.renderer.shadowMap.needsUpdate = true;
      return;
    }
    if (this.shadowTimer !== 0) return;
    this.shadowTimer = window.setTimeout(() => {
      this.shadowTimer = 0;
      this.requestRender();
    }, wait);
  }

  // ---- the staged opening (Phase 15.1) ----------------------------------------------------------------------
  // preparing: the house model (floors, walls, doors, windows) is built and its shaders compile in the background;
  //   nothing is drawn. Its first frame draws the shadow maps, then the canvas fades in.
  // opening: the opening camera move and the floor widgets' layout run alone, until the camera has been still for
  //   `openingQuietMs` (camera channel idle; ambient effects and state animations do not count).
  // loading: house textures, then the separate objects, load through the queue a few at a time; each batch of
  //   objects is one instance sync, its shaders compile in the background before it shows, images decode off the
  //   main thread and upload a few per frame; shadows are redrawn throttled. A thin bar shows what remains.
  // done: everything requested is drawn; the final shadow pass runs and the bar fades out.

  /** A new opening sequence for the shown floor: later lanes close and the earlier sequence's callbacks stop. */
  private restartStages(): void {
    this.stageToken += 1;
    this.clearStageTimers();
    this.loadQueue.reset();
    this.loadStage = "preparing";
    this.revealPending = false;
    this.templatesDirty = false;
    this.admittedKeys.clear();
    this.warmingKeys.clear();
    this.heldAtLoading = 0;
    this.renderer.domElement.toggleAttribute("data-preparing", true);
    this.cameraAnimation?.cancel();
    this.timing?.stage("preparing");
    const keys = new Set<string>();
    // Every shown floor's doors and windows (all floors in the whole house, 18.1) belong to the house model.
    for (const floor of this.contentFloors()) {
      for (const area of floor.areas)
        for (const wall of area.walls)
          for (const opening of wall.objects)
            keys.add(templateKey(opening.templateId, opening.templateVersion));
      // Yard fences belong to the house model like walls (17.2).
      for (const segment of floorFenceSegments(floor))
        keys.add(templateKey(segment.templateId, segment.templateVersion));
    }
    this.houseTemplateKeys = keys;
    this.reportProgress();
  }

  private clearStageTimers(): void {
    window.clearTimeout(this.admitTimer);
    window.clearTimeout(this.shadowTimer);
    window.clearTimeout(this.openingTimer);
    window.clearTimeout(this.openingCapTimer);
    window.clearTimeout(this.batchTimer);
    this.batchTimer = 0;
    this.admitTimer = 0;
    this.shadowTimer = 0;
    this.openingTimer = 0;
    this.openingCapTimer = 0;
    this.dropOpeningWatch?.();
    this.dropOpeningWatch = null;
  }

  /** Preparing: waits for the doors' and windows' templates (at most `houseWaitMs`), then prepares the house model. */
  private waitForHouseModel(token: number): void {
    const startedAt = performance.now();
    let done = false;
    const go = (): void => {
      if (done) return;
      done = true;
      // Release the queue subscription and the cap even when this load is stale (a newer load or dispose).
      unsubscribe();
      window.clearTimeout(cap);
      if (token !== this.stageToken || this.disposed) return;
      void this.prepareHouse(token);
    };
    const unsubscribe = this.loadQueue.subscribe(() => {
      if (this.loadQueue.laneSettled(houseLane)) go();
    });
    const cap = window.setTimeout(go, Math.max(0, houseWaitMs - (performance.now() - startedAt)));
    if (this.loadQueue.laneSettled(houseLane)) go();
  }

  /** Compiles the house model's shaders in the background (sun, lamps, shadows included), then shows it. */
  private async prepareHouse(token: number): Promise<void> {
    // The material patches (sky light, strips) attach before a render; compile what that render would use.
    this.sky.beforeRender();
    this.lights.beforeRender(this.scene);
    const started = performance.now();
    await this.compileInBackground([this.scene]);
    if (token !== this.stageToken || this.disposed) return;
    this.timing?.compile("house model", performance.now() - started);
    // What is drawn now stays drawn when the placed view starts gating; on a floor switch only the house model is
    // drawn now (21.5), so only its templates count, and the objects load after the ride.
    this.markAdmitted(this.holdObjects ? this.houseTemplateKeys : null);
    this.loadStage = "opening";
    this.timing?.stage("opening");
    this.revealPending = true;
    this.renderer.shadowMap.needsUpdate = true;
    this.requestRender();
  }

  /** After the house model's first frame (with its shadow pass): fade in, run the opening move, watch it settle. */
  private reveal(): void {
    this.revealPending = false;
    this.renderer.domElement.toggleAttribute("data-preparing", false);
    // A floor switch (16.13, 21.5): the destination is ready and drawn once from the ride's start; now it rides.
    if (this.ride !== null && this.slide === null) this.startSlide();
    const token = this.stageToken;
    this.openingCapTimer = window.setTimeout(() => {
      this.beginLoading(token);
    }, openingMaxMs);
    this.watchOpening(token);
  }

  /**
   * The opening has settled (15.3 signal for 15.1): no camera move ran for `openingQuietMs` after the camera channel
   * went idle. A widget layout that starts a new move restarts the wait.
   */
  private watchOpening(token: number): void {
    this.dropOpeningWatch?.();
    // A floor switch's slide counts like the opening move (16.3): objects start loading once it is over.
    this.dropOpeningWatch = this.frames.whenIdle(["camera", floorSlideChannel], () => {
      this.dropOpeningWatch = null;
      window.clearTimeout(this.openingTimer);
      this.openingTimer = window.setTimeout(() => {
        if (token !== this.stageToken || this.loadStage !== "opening") return;
        if (this.frames.active("camera") || this.frames.active(floorSlideChannel)) this.watchOpening(token);
        else this.beginLoading(token);
      }, openingQuietMs);
    });
  }

  private beginLoading(token: number): void {
    if (token !== this.stageToken || this.loadStage !== "opening" || this.disposed) return;
    window.clearTimeout(this.openingTimer);
    window.clearTimeout(this.openingCapTimer);
    this.openingTimer = 0;
    this.openingCapTimer = 0;
    this.dropOpeningWatch?.();
    this.dropOpeningWatch = null;
    this.loadStage = "loading";
    this.timing?.stage("loading");
    this.holdObjects = false;
    this.loadQueue.open(objectLane);
    // Templates already loaded but not placed (a floor switch's objects, 21.5) are placed in batches from now on.
    this.heldAtLoading = this.unplacedKeys().length;
    if (this.heldAtLoading > 0) {
      this.templatesDirty = true;
      this.scheduleAdmit();
    }
    this.reportProgress();
    this.checkLoaded();
  }

  /** A template finished loading (or failed). */
  private templateLoaded(): void {
    if (this.disposed) return;
    // The house model's doors and windows (and anything after loading is over) are placed at once.
    if (this.loadStage === "preparing" || this.loadStage === "done") {
      this.syncInstances();
      this.markAdmitted();
      this.requestRender();
      return;
    }
    this.templatesDirty = true;
    this.scheduleAdmit();
  }

  /**
   * Every template that is ready counts as placed (no background compile: preparing compiles the whole scene); with
   * `only`, just those templates (a floor switch's house model, 21.5).
   */
  private markAdmitted(only: ReadonlySet<string> | null = null): void {
    for (const key of this.floorTemplateKeys())
      if (this.templateSettled(key) && (only === null || only.has(key))) this.admittedKeys.add(key);
  }

  /** Every templated thing of the shown floors (18.1: all of them in the whole house): objects, doors and windows, drawn light fixtures; by instance ID. */
  private floorInstances(): { id: string; key: string; templateId: string; version: number }[] {
    const list: { id: string; key: string; templateId: string; version: number }[] = [];
    const add = (id: string, templateId: string, version: number): void => {
      list.push({ id, key: templateKey(templateId, version), templateId, version });
    };
    for (const area of this.contentFloors().flatMap((floor) => floor.areas)) {
      for (const object of area.objects) add(object.id, object.templateId, object.templateVersion);
      for (const wall of area.walls)
        for (const opening of wall.objects) add(opening.id, opening.templateId, opening.templateVersion);
      for (const light of area.lights)
        if (light.fixture !== null && light.fixtureVisible)
          add(light.id, light.fixture.templateId, light.fixture.templateVersion);
      for (const segment of yardFenceSegments(area))
        add(segment.id, segment.templateId, segment.templateVersion);
    }
    return list;
  }

  private floorTemplateKeys(): Set<string> {
    return new Set(this.floorInstances().map((instance) => instance.key));
  }

  /** Loaded (or failed) templates of the shown floors not placed yet. */
  private unplacedKeys(): string[] {
    return [...this.floorTemplateKeys()].filter(
      (key) => !this.admittedKeys.has(key) && this.templateSettled(key),
    );
  }

  /** Loaded or failed; never requests a load (progress reads it on every queue change). */
  private templateSettled(key: string): boolean {
    const at = key.lastIndexOf("@");
    const state = this.templates.peek(key.slice(0, at), Number(key.slice(at + 1)));
    return state !== null && state.state !== "loading";
  }

  /** The next batch of objects is added when the last one has compiled and `admitGapMs` has passed. */
  private scheduleAdmit(): void {
    if (!this.templatesDirty || this.warmingKeys.size > 0 || this.admitTimer !== 0) return;
    const wait = this.lastAdmitAt + admitGapMs - performance.now();
    if (wait <= 0) {
      this.runAssets();
      return;
    }
    this.admitTimer = window.setTimeout(() => {
      this.admitTimer = 0;
      this.runAssets();
    }, wait);
  }

  /** Asset work in frames (the "assets" channel): GPU uploads a few per frame, and the due batch of objects. */
  private runAssets(): void {
    if (this.assetsAnimation?.status() === "active") return;
    this.assetsAnimation = this.frames.start({
      channel: "assets",
      step: (now) => this.stepAssets(now),
    });
  }

  private stepAssets(now: number): boolean {
    this.uploadSome();
    if (this.templatesDirty && this.warmingKeys.size === 0 && now >= this.lastAdmitAt + admitGapMs)
      this.admitTemplates(now);
    return this.uploads.length > 0;
  }

  /** Decoded images: uploaded in frames, at least one per frame and more while within `uploadBudgetMs`. */
  private queueUpload(texture: Texture): Promise<void> {
    return new Promise((resolve) => {
      if (this.disposed) {
        resolve();
        return;
      }
      this.uploads.push({ texture, resolve });
      this.runAssets();
    });
  }

  private uploadSome(): void {
    const started = performance.now();
    for (let count = 0; count < maxUploadsPerFrame; count += 1) {
      if (count > 0 && performance.now() - started >= uploadBudgetMs) break;
      const upload = this.uploads.shift();
      if (upload === undefined) break;
      const at = performance.now();
      this.renderer.initTexture(upload.texture);
      this.timing?.upload(performance.now() - at);
      upload.resolve();
    }
  }

  /**
   * One batch: the objects of every template that finished since the last batch are placed in one instance sync,
   * kept on a layer no camera renders while their shaders compile in the background (after this frame has attached
   * the material patches), then shown together.
   */
  private admitTemplates(now: number): void {
    this.lastAdmitAt = now;
    // A few templates per batch (21.5: a floor's objects come in steps with the bar, not at once).
    const waiting = this.unplacedKeys();
    const fresh = waiting.slice(0, admitBatchTemplates);
    this.templatesDirty = waiting.length > fresh.length;
    // Admitted first: the placed view lets the instance layer see these templates from this sync on.
    for (const key of fresh) this.admittedKeys.add(key);
    const started = performance.now();
    this.syncInstances("throttled");
    this.timing?.admit(fresh.length, performance.now() - started);
    const freshSet = new Set(fresh);
    const roots: Object3D[] = [];
    for (const instance of this.floorInstances()) {
      if (!freshSet.has(instance.key)) continue;
      const root = this.houseView()?.instanceRoot(instance.id) ?? this.instances.root(instance.id);
      if (root !== null) roots.push(root);
    }
    const hidden: { mesh: Object3D; mask: number }[] = [];
    for (const root of roots)
      root.traverse((child) => {
        if (!isMesh(child)) return;
        hidden.push({ mesh: child, mask: child.layers.mask });
        child.layers.set(warmLayer);
      });
    if (hidden.length === 0) {
      this.reportProgress();
      this.checkLoaded();
      return;
    }
    for (const key of fresh) this.warmingKeys.add(key);
    this.reportProgress();
    const token = this.stageToken;
    this.afterRender.push(() => {
      const compiling = performance.now();
      void this.compileInBackground(roots).then(() => {
        if (this.disposed) return;
        for (const { mesh, mask } of hidden) mesh.layers.mask = mask;
        if (token !== this.stageToken) return;
        this.timing?.compile(`${String(fresh.length)} templates`, performance.now() - compiling);
        for (const key of fresh) this.warmingKeys.delete(key);
        this.requestShadows("throttled");
        this.requestRender();
        this.reportProgress();
        this.scheduleAdmit();
        this.checkLoaded();
      });
    });
  }

  /**
   * Before a material takes its image map (15.1): its mapped shader compiles in the background on a twin of each of
   * its meshes (same geometry, so the same program), on a layer no camera renders. The twins stay until loading is
   * done so the compiled programs stay alive until the material uses them.
   */
  private warmMap(material: MeshStandardMaterial, map: Texture): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const meshes: Mesh[] = [];
    const layouts = new Set<string>();
    this.planRoot.traverse((child) => {
      if (!isMesh(child) || child.material !== material) return;
      const layout = Object.keys(child.geometry.attributes).sort().join(",");
      if (layouts.has(layout)) return;
      layouts.add(layout);
      meshes.push(child);
    });
    if (meshes.length === 0) return Promise.resolve();
    const twin = material.clone();
    twin.map = map;
    const group = new Group();
    for (const mesh of meshes) {
      const copy = new Mesh(mesh.geometry, twin);
      copy.castShadow = mesh.castShadow;
      copy.receiveShadow = mesh.receiveShadow;
      copy.layers.set(warmLayer);
      copy.raycast = () => undefined;
      group.add(copy);
    }
    this.planRoot.add(group);
    this.warmTwins.push({ group, material: twin });
    // The patches attach to the twin as they would to the material.
    this.sky.beforeRender();
    this.lights.beforeRender(this.scene);
    const started = performance.now();
    this.mapWarms += 1;
    return this.compileInBackground([group]).then(() => {
      this.mapWarms -= 1;
      this.timing?.compile(
        `mapped ${material.name === "" ? "surface" : material.name}`,
        performance.now() - started,
      );
      this.checkLoaded();
    });
  }

  /**
   * Compiles the shaders of these objects (as they would draw in the scene, its lights and shadows included) without
   * blocking (renderer.compileAsync, KHR_parallel_shader_compile where supported). Never rejects: a failure, or a
   * compile still running after `compileWaitMs`, leaves the rest to the next frame that draws them.
   */
  private compileInBackground(objects: readonly Object3D[]): Promise<void> {
    const compiling = (async (): Promise<void> => {
      try {
        await Promise.all(
          objects.map((object) =>
            this.renderer.compileAsync(object, this.camera, object === this.scene ? null : this.scene),
          ),
        );
      } catch (error) {
        console.warn("[homeplan] background shader compile failed", error);
      }
    })();
    return Promise.race([compiling, delay(compileWaitMs)]);
  }

  private releaseTwins(): void {
    for (const { group, material } of this.warmTwins) {
      group.removeFromParent();
      material.dispose();
    }
    this.warmTwins = [];
  }

  /** Loading is done once nothing waits, runs, uploads, compiles, or awaits its batch. */
  private checkLoaded(): void {
    if (this.loadStage !== "loading") return;
    const progress = this.loadQueue.progress();
    if (
      progress.queued > 0 ||
      progress.running > 0 ||
      this.uploads.length > 0 ||
      this.mapWarms > 0 ||
      this.warmingKeys.size > 0 ||
      this.templatesDirty
    )
      return;
    this.loadStage = "done";
    this.timing?.stage("done");
    this.shadowsDue = false;
    this.renderer.shadowMap.needsUpdate = true;
    // The twins' programs are in use by now (or were never needed): release them after this last frame.
    this.afterRender.push(() => {
      this.releaseTwins();
    });
    this.precompileFinal();
    this.requestRender();
    this.reportProgress();
    this.scheduleBatch(batchQuietMs);
  }

  /**
   * After loading (Phase 16.6): every material in the scene compiles in the background for the floor's final light
   * topology, which on/off never changes (lightsLayer.ts), so no light switch compiles a shader.
   */
  private precompileFinal(): void {
    const token = this.stageToken;
    this.sky.beforeRender();
    this.lights.beforeRender(this.scene);
    const started = performance.now();
    // Over the shadow budget, also the point/spot shadow splits one switch may move to (lightsLayer.ts): each
    // compile gathers its lights at once, so the splits are applied only for the call.
    const compiles = [this.compileInBackground([this.scene])];
    this.lights.withNeighbourSplits(() => {
      compiles.push(this.compileInBackground([this.scene]));
    });
    void Promise.all(compiles).then(() => {
      if (token === this.stageToken && !this.disposed)
        this.timing?.compile(
          `final light topology (${String(compiles.length)} shadow splits)`,
          performance.now() - started,
        );
    });
  }

  /** The remaining objects and textures: queued, loading, or loaded and not yet shown. */
  private reportProgress(): void {
    const progress = this.loadQueue.progress();
    const unplaced = [...this.floorTemplateKeys()].filter(
      (key) => this.templateSettled(key) && (!this.admittedKeys.has(key) || this.warmingKeys.has(key)),
    ).length;
    const remaining =
      this.loadStage === "done" ? 0 : progress.queued + progress.running + this.uploads.length + unplaced;
    this.onLoadProgress({
      stage: this.loadStage,
      total: Math.max(progress.total, this.heldAtLoading, remaining),
      remaining,
    });
    if (this.loadStage === "loading" && progress.queued === 0 && progress.running === 0) this.checkLoaded();
  }
}
