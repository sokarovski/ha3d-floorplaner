// Editor-session UI state: selection, mode, tool, Magnetic, view, tree expansion. Session-local, never saved.
import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";
import { readEffectsOn } from "../services/effectsSetting";

export type EditorMode = "overview" | "area";
export type ViewMode = "top" | "3d";

export type ToolId =
  | "select"
  | "nudge"
  | "cornerEdit"
  | "rotateArea"
  | "rotate"
  | "rectangle"
  | "circle"
  | "polygon"
  | "tape"
  | "raiseWall"
  | "trimWall"
  | "splitWall"
  | "fillWalls"
  | "reassignWall"
  | "placeOpening"
  | "placeObject"
  | "roofLine"
  | "roofWindow"
  | "pan"
  | "orbit";

/** floor: the whole active floor; selection: the selected areas; focus: the area being edited (else floor). */
export type FrameRequestTarget = "floor" | "selection" | "focus";

/** Toolbox camera buttons (owner, Phase 5 follow-up): look straight down, or turn the view a quarter. */
export type CameraPreset = "lookDown" | "turnQuarter";

export type UiState = Readonly<{
  activeFloorId: string;
  /**
   * The whole-house overview (Phase 16.4, owner 2026-11-18): the level above the floors in a multi-floor house,
   * where every floor is shown stacked and a floor is selected and moved as a group. Only with an empty edit path
   * (`mode` "overview"); entering a floor turns it off (editContext.ts).
   */
  houseOverview: boolean;
  mode: EditorMode;
  /** The area edited in Room Editor. */
  focusAreaId: string | undefined;
  /** Carpet Editor (Phase 5.14): the carpet of the focused area whose pieces are being edited. */
  focusCarpetId: string | undefined;
  /** An object group opened for editing its members one by one (double-click a member); session-only. */
  focusGroupId: string | undefined;
  /** Wall feature editing: the feature of the open wall face whose shapes are being edited with the shape tools. */
  focusReliefId: string | undefined;
  /**
   * A roof's editing level (Phase 19.1, spec/builder/features/roofs.md#the-roof-editing-level): the roof of the active
   * floor whose sheet is being edited (break lines, points, outline). Only with `mode` "overview" and no area open;
   * entered from the whole-house overview, and leaving it returns there with the roof selected (editContext.ts).
   */
  focusRoofId: string | undefined;
  /**
   * A roof face view (Phase 19.3): one level inside the roof's, looking straight at the flat face under this plan
   * point (floor frame) to draw holes and place roof windows. Faces are derived from the break lines, so the level
   * keeps a point on the roof sheet, not a face index.
   */
  focusRoofFace: Readonly<{ x: number; y: number }> | undefined;
  /** Wall face view (Phase 5.1): the wall face of the focused area seen straight on, to draw reliefs. */
  focusWallFace: Readonly<{ wallId: string; side: "interior" | "exterior" }> | undefined;
  /** Room Editor: other areas faded (true) or hidden (false). */
  showOthers: boolean;
  /** Walls off (Phase 4.5): walls drawn as flat traces on the floor; session-only, never saved. */
  wallsVisible: boolean;
  /**
   * Light controls (owner, Phase 5 follow-up; Phase 7.9 split), session-only: hidden (no pins or handles; the
   * default, owner 2026-11-15), shown, or focus (Phase 5.11: everything but lights dims and only lights respond).
   */
  lightControls: "hidden" | "shown" | "focus";
  /**
   * Sun view (owner 2026-11-16), session-only: the house's own sun (environment location and time), a fixed
   * daytime sun, or night (no sun; lamps carry the scene). It never changes the house environment.
   */
  sunView: "house" | "day" | "night";
  /** Lights on/off (Phase 7.9, owner): off switches every artificial light off in the view; session-only. */
  lightsOn: boolean;
  /**
   * Hide (Phase 7.5, P4): entities hidden for this session only (eye in the tree, Shift+H); never saved. Hidden
   * things are not drawn, picked, or snapped to.
   */
  hiddenIds: readonly string[];
  /** Show hidden (Phase 7.5): saved-hidden things drawn ghosted and pickable; session-only. */
  showHidden: boolean;
  /** A light just added from the tree that follows the pointer until a click places it (Phase 5.12). */
  placingLightId: string | undefined;
  selection: readonly string[];
  tool: ToolId;
  /** Published by the tool controller, including Select drags that preview only in the runtime. */
  toolOperationActive: boolean;
  magnetic: boolean;
  /** Select a different clicked target before acting; never selects on hover. Independent of snapping. */
  autoSelect: boolean;
  /**
   * Shift is held in Nudge or Rotate with no operation running, so the next press uses the flipped
   * Auto-select (Phase 5.3). Session-only; drives the toolbox cue.
   */
  autoSelectShiftFlip: boolean;
  viewMode: ViewMode;
  /**
   * The view (3D or Top) the user had before entering a roof's level (Phase 19.5): the roof level opens in Top, and
   * leaving it gives this view back. Session-only.
   */
  viewModeBeforeRoof: ViewMode | undefined;
  expanded: readonly string[];
  /** A short message for the status bar (e.g. why an edit was rejected). */
  notice: Readonly<{ tone: "info" | "warning" | "danger"; text: string }> | undefined;
  /** The orphaned wall being reassigned with the reassign tool. */
  reassignWallId: string | undefined;
  /** Plan point at the center of the viewport (mm), for placing new areas. */
  viewCenterMm: Readonly<{ x: number; y: number }>;
  /** Bumps when the viewport should frame its content. */
  frameRequest: Readonly<{ serial: number; target: FrameRequestTarget }>;
  /** Bumps when the viewport should apply a camera preset (then fit). */
  cameraRequest: Readonly<{ serial: number; preset: CameraPreset }>;
  /** Ambient effects on/off (D24, header toggle next to Lights); paused by default (owner: the view should not redraw
   * without need); the last choice is remembered in this browser (`effectsSetting.ts`). */
  effectsOn: boolean;
}>;

export const createUiStore = (
  activeFloorId: string,
  houseId: string,
  houseOverview = false,
): StoreApi<UiState> =>
  createStore<UiState>(() => ({
    activeFloorId,
    houseOverview,
    mode: "overview",
    focusAreaId: undefined,
    focusCarpetId: undefined,
    focusReliefId: undefined,
    focusGroupId: undefined,
    focusWallFace: undefined,
    focusRoofId: undefined,
    focusRoofFace: undefined,
    showOthers: true,
    wallsVisible: true,
    lightControls: "hidden",
    lightsOn: false,
    sunView: "house",
    hiddenIds: [],
    showHidden: false,
    placingLightId: undefined,
    selection: [],
    tool: "select",
    toolOperationActive: false,
    magnetic: true,
    autoSelect: false,
    autoSelectShiftFlip: false,
    viewMode: "3d",
    viewModeBeforeRoof: undefined,
    expanded: [houseId, activeFloorId],
    notice: undefined,
    reassignWallId: undefined,
    viewCenterMm: { x: 0, y: 0 },
    frameRequest: { serial: 0, target: "floor" },
    cameraRequest: { serial: 0, preset: "lookDown" },
    effectsOn: readEffectsOn(),
  }));
