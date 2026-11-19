// Public contract of the Three.js viewport runtime (spec/architecture/renderer.md#proposed-runtime-boundary).
// All model-facing values are plan millimetres (x, y, h) in the active building floor's frame (in the builder's
// whole-house overview, Phase 16.4, the house frame); screen
// coordinates are CSS pixels relative to the container's top-left corner.
import type { VisibilityRule } from "@shared/domain/house/visibility";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { OpeningSizeResolver } from "@shared/geometry/realAllWallsTypes";

export type PlanPoint = Readonly<{ x: number; y: number }>;
export type PlanPoint3 = Readonly<{ x: number; y: number; h: number }>;
export type ScreenPoint = Readonly<{ x: number; y: number }>;

export type ViewMode = "top" | "3d";
export type NavigationMode = "trackpad" | "mouse";
export type HelperTheme = "light" | "dark";

export type ViewportRuntimeOptions = Readonly<{
  container: HTMLElement;
  /** URL of a house image by ID (server-owned assets, D17/api.md). */
  imageUrl: (imageId: string) => string;
  /** URL of a template version's glTF/GLB (built-in or house template). */
  templateUrl: (templateId: string, version: number) => string;
  onEvent: (event: RuntimeEvent) => void;
}>;

export type SceneInput = Readonly<{
  house: HouseDocument;
  floorId: string;
  /** Must be referentially stable: RealAllWalls is memoized by floor and resolver identity. */
  openingSize: OpeningSizeResolver;
}>;

/**
 * Wall side of a pick hit: the owning band face, `end` for a wall end face, or `top` for a horizontal
 * cap (wall top, sill, reveal) resolved through wallsAtPoint.
 */
export type PickWallSide = "interior" | "exterior" | "end" | "top";

export type PickHit =
  | Readonly<{
      kind: "wall";
      wallId: string;
      areaId: string;
      side: PickWallSide;
      pointMm: PlanPoint3;
      /** A face of a box or niche on this wall (Phase 5.0). */
      reliefId?: string;
    }>
  | Readonly<{ kind: "floor"; areaId: string; pointMm: PlanPoint3 }>
  | Readonly<{ kind: "carpet"; carpetId: string; areaId: string; pointMm: PlanPoint3 }>
  | Readonly<{ kind: "object"; instanceId: string; areaId: string; wallId?: string; pointMm: PlanPoint3 }>
  | Readonly<{
      kind: "light";
      lightId: string;
      areaId: string;
      pointMm: PlanPoint3;
      /** Several light pins under the pointer (Phase 5.11): which one this is; a click on the same spot cycles. */
      stack?: Readonly<{ index: number; total: number }>;
    }>
  | Readonly<{ kind: "helper"; id: string; pointMm: PlanPoint3 }>
  /** The builder's whole-house overview (Phase 16.4): a building floor as a group; pointMm in the house frame. */
  | Readonly<{ kind: "buildingFloor"; floorId: string; pointMm: PlanPoint3 }>
  /**
   * A roof (Phase 19.1): in the whole-house overview (pointMm in the house frame) or while editing it (the floor's
   * frame). Floor and room views never draw roofs.
   */
  | Readonly<{ kind: "roof"; roofId: string; floorId: string; pointMm: PlanPoint3 }>;

export type PointerPhase = "down" | "move" | "up" | "leave" | "cancel";

/** Primary-button (and hover) pointer input forwarded to editor tools. Camera gestures never produce these. */
export type RuntimePointerEvent = Readonly<{
  type: "pointer";
  phase: PointerPhase;
  /** DOM button of the change (0 = primary); −1 for moves without a button change. */
  button: number;
  /** DOM buttons bitmask at the time of the event. */
  buttons: number;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  screen: ScreenPoint;
  /** The DOM pointer type ("mouse", "pen", "touch"), when known: the click slop is larger on touch (Phase 19.6). */
  pointerType?: string;
  /** Intersection with the h = 0 plane, plan mm; null when the ray misses it. */
  plan: PlanPoint | null;
  hit: PickHit | null;
}>;

export type CameraSnapshot = Readonly<{
  mode: ViewMode;
  /** World metres (Three.js frame: x = plan x, y = up, z = −plan y). */
  position: Readonly<{ x: number; y: number; z: number }>;
  target: Readonly<{ x: number; y: number; z: number }>;
  up: Readonly<{ x: number; y: number; z: number }>;
  /** Perspective vertical field of view (3D only). */
  fovDeg: number | null;
  /** Visible world height in metres (Top only). */
  orthoHeightM: number | null;
  aspect: number;
}>;

export type RuntimeEvent =
  | Readonly<{ type: "unsupported"; reason: string }>
  | RuntimePointerEvent
  | Readonly<{ type: "doubleClick"; screen: ScreenPoint; hit: PickHit | null }>
  | Readonly<{ type: "cameraChange"; camera: CameraSnapshot }>
  | Readonly<{ type: "contextLost" }>
  | Readonly<{ type: "contextRestored" }>;

export type FrameTarget =
  | Readonly<{ kind: "floor" }>
  | Readonly<{ kind: "bounds"; minX: number; minY: number; maxX: number; maxY: number }>;

export type ViewportSelection = Readonly<{
  wallIds: readonly string[];
  areaIds: readonly string[];
  /** Extra walls preferred when a top-cap hit is ambiguous; selected walls are always preferred. */
  preferredWallIds?: readonly string[];
  /** Selected lights: their pins and beam footprints show in the selection tone (Phase 5.11). */
  lightIds?: readonly string[];
  /** Selected effects, or objects whose effects, play once when they join the selection (D24 preview). */
  effectIds?: readonly string[];
}>;

export type HelperSettings = Readonly<{
  groundGrid: boolean;
  theme: HelperTheme;
  /** The colour scheme's selection colours (Phase 5.5); the built-in blue when absent. */
  accent?: Readonly<{ selection: string; accent: string; accentStrong: string }>;
}>;

/** Semantic colors for overlay primitives, resolved against the helper theme. */
export type OverlayTone =
  | "accent"
  /** A hovered grab handle: darker than accent in light theme, lighter in dark theme. */
  | "accentStrong"
  | "guide"
  | "warning"
  | "danger"
  | "neutral"
  /** Inference cues (SketchUp colors): plan x red, plan y green, vertical blue, edge-related magenta. */
  | "inferenceX"
  | "inferenceY"
  | "inferenceVertical"
  | "inferenceEdge";

/** Tool-preview primitives in plan mm (h defaults to 0). All overlays are helpers, excluded from exports. */
export type OverlayPrimitive =
  | Readonly<{
      kind: "segment";
      from: PlanPoint3 | PlanPoint;
      to: PlanPoint3 | PlanPoint;
      dashed?: boolean;
      tone?: OverlayTone;
      /** Screen width in CSS px (Phase 19.5); absent or 1: the plain one-pixel line. */
      widthPx?: number;
    }>
  | Readonly<{
      kind: "polyline";
      points: readonly (PlanPoint3 | PlanPoint)[];
      closed?: boolean;
      dashed?: boolean;
      tone?: OverlayTone;
      /** Screen width in CSS px (Phase 19.5); absent or 1: the plain one-pixel line. */
      widthPx?: number;
    }>
  | Readonly<{
      kind: "polygon";
      points: readonly PlanPoint[];
      /** Inner rings left unfilled (a room with a courtyard); outlined like the outer ring. */
      holes?: readonly (readonly PlanPoint[])[];
      hMm?: number;
      fillOpacity?: number;
      outline?: boolean;
      tone?: OverlayTone;
    }>
  | Readonly<{
      kind: "point";
      at: PlanPoint3 | PlanPoint;
      /** "dotBold"/"crossBold": a hovered grab handle, heavier at the same size. */
      marker?: "dot" | "cross" | "dotBold" | "crossBold";
      sizePx?: number;
      tone?: OverlayTone;
    }>
  | Readonly<{
      kind: "verticalLine";
      at: PlanPoint;
      fromHMm: number;
      toHMm: number;
      dashed?: boolean;
      tone?: OverlayTone;
    }>;

/**
 * Focus on one area. Other areas (floor, carpets, walls, objects, lights) render faded (10 %) or hidden; in
 * Area Editor the focused area's own walls and objects fade to 25 % so its floor shape is clear. Locked
 * isolation (Area Editor, Wall Editor) also makes other areas unpickable.
 */
export type AreaIsolation = Readonly<{
  areaId: string;
  others: "faded" | "hidden";
  fadeOwnContent: boolean;
  othersLocked: boolean;
}>;

export type AreaPreviewTransform = Readonly<{ positionMm: PlanPoint; rotationDeg: number }>;

export type SunSettings = Readonly<{
  /** Unit vector from the scene toward the sun, plan axes (x, y, h); h > 0 is above the horizon. */
  directionPlan: PlanPoint3;
  intensity: number;
}>;

export type ExportPngOptions = Readonly<{ scale: 1 | 2 | 4; transparentBackground: boolean }>;

export type ExportPngResult = Readonly<{
  blob: Blob;
  width: number;
  height: number;
  /** True when the requested size exceeded the GPU limit and was scaled down. */
  capped: boolean;
  camera: CameraSnapshot;
}>;

export type RenderSceneExport = Readonly<{
  /** World metres, y up (Three axes); lights as KHR_lights_punctual in physical candela. */
  glb: Blob;
  camera: CameraSnapshot;
  /** directionWorld: unit vector toward the sun in Three world axes; intensity 0 = no sun. */
  sun: Readonly<{ directionWorld: [number, number, number]; intensity: number }>;
}>;

/**
 * A primary-button drag that moves the camera instead of reaching the editor (Phase 5.13: the Pan and Orbit
 * tools, holding Space). `shift` says what holding Shift turns the drag into. Top view always pans.
 */
export type PrimaryCameraDrag = Readonly<{ base: "pan" | "orbit"; shift: "toPan" | "toOrbit" | "none" }>;

/**
 * A wall face seen straight on (Phase 5.1): its line on the floor from the wall's span start, the direction
 * along the wall, the normal toward the viewer, and its size. `clipAheadMm`: geometry nearer than this in
 * front of the face is clipped (the room's opposite wall), leaving room for boxes sticking out.
 */
export type FaceViewFrame = Readonly<{
  originMm: PlanPoint;
  directionPlan: PlanPoint;
  normalPlan: PlanPoint;
  lengthMm: number;
  heightMm: number;
  clipAheadMm: number;
  /**
   * A tilted face (a roof face view, Phase 19.3) instead of a vertical one: the camera looks straight at the plane
   * through `originMm` with this unit `normal` (floor frame), framing `lengthMm` × `heightMm` around `centerMm`;
   * facePointAt measures along `along` and `up` from the origin (both unit, in the plane).
   */
  tilt?: Readonly<{
    originMm: PlanPoint3;
    centerMm: PlanPoint3;
    normal: PlanPoint3;
    along: PlanPoint3;
    up: PlanPoint3;
  }>;
}>;

export type ViewportRuntime = Readonly<{
  setScene: (input: SceneInput) => void;
  setViewMode: (mode: ViewMode) => void;
  setNavigation: (navigation: NavigationMode) => void;
  /** Primary drags move the camera while set (Pan/Orbit tools, Space held); null gives them to the editor. */
  setPrimaryDrag: (drag: PrimaryCameraDrag | null) => void;
  /**
   * Wall face view (Phase 5.1): look straight at a wall face (orbit locked), or null to return. A frame with `tilt`
   * looks straight at a sloped plane (a roof face view, Phase 19.3).
   */
  setFaceView: (face: FaceViewFrame | null) => void;
  /**
   * Where the pointer meets the face of the open face view: along the wall from its span start, and height (a tilted
   * face: along and up its plane from its origin).
   */
  facePointAt: (screenX: number, screenY: number) => Readonly<{ alongMm: number; heightMm: number }> | null;
  /** Light controls (owner, Phase 5 follow-up): hide the light pins (and their picking) or show them. */
  setLightPinsVisible: (visible: boolean) => void;
  /** An object's box: its 8 corners in floor plan mm (bottom 4, then top 4), or null before it is built. */
  instanceBounds: (instanceId: string) => readonly PlanPoint3[] | null;
  /** Screen space covered by overlays (the floating toolbox on the left); fitting centres in the rest. */
  setViewInsets: (insets: Readonly<{ leftPx: number }>) => void;
  /** 3D camera moves (owner, Phase 5 follow-up): look straight down, or turn a quarter about the pivot. */
  cameraPreset: (preset: "lookDown" | "turnQuarter") => void;
  /** Fixtures, placeholders, and strips drawn or not (they still light the scene). */
  setLightFixturesVisible: (visible: boolean) => void;
  /** Room Editor (owner): floors, walls, and carpets drawn in their base colours without image textures. */
  setSurfaceTexturesVisible: (visible: boolean) => void;
  /** Ambient effects on or off (D24, the header toggle): on shows them and plays every effect once now. */
  setEffectsOn: (on: boolean) => void;
  /** Lights on/off (Phase 7.9): off draws every artificial light switched off (session view, never saved). */
  setLightsOn: (on: boolean) => void;
  /**
   * Hide and Hidden (Phase 7.5): session-hidden IDs and Show hidden. Hidden things are not drawn, picked, or
   * snapped to; saved-hidden ones are drawn ghosted while Show hidden is on. Exports never draw saved-hidden ones.
   */
  setVisibility: (rule: VisibilityRule) => void;
  /** Lights focus (Phase 5.11): everything but lights dims and only lights can be picked. */
  setLightsFocus: (on: boolean) => void;
  /** Ends a click–move–click camera follow (Escape); true when one was running. */
  stopCameraFollow: () => boolean;
  frame: (target?: FrameTarget) => void;
  setSelection: (selection: ViewportSelection) => void;
  setIsolation: (isolation: AreaIsolation | null) => void;
  /**
   * View gizmo (Phase 4.6), 3D only: orbit so the floor's red (x) or green (y) axis points at the viewer,
   * keeping the pivot, elevation, and distance.
   */
  lookFromAxis: (axis: "x" | "y") => void;
  /** Walls off (Phase 4.5): walls as flat floor traces; exports always include the walls. */
  setWallsVisible: (visible: boolean) => void;
  setHelpers: (helpers: HelperSettings) => void;
  setOverlay: (overlay: readonly OverlayPrimitive[]) => void;
  setAreaPreviewTransform: (areaId: string, transform: AreaPreviewTransform | null) => void;
  /**
   * The builder's whole-house overview (Phase 16.4): on, every floor of the scene's house is drawn stacked at its
   * placement (walls, doors and windows, floors, slabs; no furniture or lights) and the single-floor content is
   * released; all model-facing values are then in the house frame and picks resolve to `buildingFloor` hits.
   * Off returns to the scene's floor in its own frame.
   */
  setHouseOverview: (on: boolean) => void;
  /**
   * A roof's editing level (Phase 19.1): draws that roof of the scene's floor over it (floor frame) and lets picks hit
   * it (`roof` hits); null for none. Floor and room views never draw roofs otherwise.
   */
  setRoofView: (roofId: string | null) => void;
  /** A running floor move in the overview: extra offsets (plan mm) by floor ID, or null for none. */
  setFloorPreviewOffsets: (offsets: ReadonlyMap<string, PlanPoint3> | null) => void;
  setSun: (sun: SunSettings) => void;
  pick: (screenX: number, screenY: number) => PickHit | null;
  planPointAt: (screenX: number, screenY: number, heightMm?: number) => PlanPoint | null;
  screenPointOf: (planMm: PlanPoint3) => ScreenPoint | null;
  /**
   * Height (mm) on the vertical line through a plan point that is closest to the pointer ray: the exact
   * push/pull height under the pointer. Null when the line is seen end-on (Top view).
   */
  heightOnVertical: (screenX: number, screenY: number, at: PlanPoint) => number | null;
  /** Millimetres per CSS pixel at the view target (snapping tolerances). */
  worldUnitsPerPixel: () => number;
  cameraSnapshot: () => CameraSnapshot;
  exportPng: (options: ExportPngOptions) => Promise<ExportPngResult>;
  /** Model-only binary glTF of the active floor for the photoreal backend, plus camera and sun. */
  exportRenderScene: () => Promise<RenderSceneExport>;
  dispose: () => void;
}>;
