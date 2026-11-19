// Owns the active tool handler: recreates it when the tool or mode changes (cancelling any partial operation,
// never committing it) and routes viewport pointer events and keys to it.
import type { RuntimePointerEvent, ViewportRuntime } from "../../../renderer/runtimeTypes";
import type { EditorSession } from "../services/editorSession";
import { faceToolEnv, inFaceSpace } from "../services/faceSpace";
import { faceOf, roofFaceOf, toolFlipsAutoSelect } from "./toolContext";
import {
  faceToolFactory,
  houseToolFactory,
  roofFaceToolFactory,
  roofToolFactory,
  toolFactory,
} from "./toolRegistry";
import { createToolPointer } from "./toolPointer";
import type { InferenceCue } from "../inference/inferenceTypes";
import type { Readout, ToolEnv, ToolHandler, ViewportCursor } from "./toolTypes";

export type ToolControllerCallbacks = Readonly<{
  setOverlay: (overlay: Parameters<ViewportRuntime["setOverlay"]>[0]) => void;
  setReadout: (readout: Readout | undefined) => void;
  setHint: (hint: string) => void;
  setCue: (cue: InferenceCue | undefined) => void;
  setCursor: (cursor: ViewportCursor) => void;
}>;

export type ToolController = Readonly<{
  pointer: (event: RuntimePointerEvent) => void;
  key: (event: KeyboardEvent) => boolean;
  /** The window lost focus: modifier keys are no longer known to be held. */
  blur: () => void;
  dispose: () => void;
}>;

/**
 * Tools that move or resize existing things (Phase 19.6): Select (handles, Move crosses), Nudge/Move in every level
 * (rooms, objects, lights, floors in the whole house, roof points, canopies, roof items, wall features) and the
 * corner editor. Their presses get the click slop (toolPointer.ts); drawing tools keep the plain drag threshold.
 */
const slopTools: ReadonlySet<string> = new Set(["select", "nudge", "cornerEdit"]);

/** Tools that re-preview (or re-hover) at once when Shift/Ctrl/Alt change (Nudge, Rotate, Select resize). */
const modifierTools: ReadonlySet<string> = new Set(["nudge", "rotateArea", "rotate", "select"]);

export const createToolController = (
  session: EditorSession,
  runtime: ViewportRuntime,
  callbacks: ToolControllerCallbacks,
): ToolController => {
  const env: ToolEnv = { session, runtime, ...callbacks };
  /** In a wall face, the shape tools run in face coordinates (x along the wall, y up) through this env. */
  // A roof face (Phase 19.3) is such a face too: u level along the slope, v up it.
  const faceEnv = faceToolEnv(env, () => faceOf(env) ?? roofFaceOf(env));
  let faceSpace = false;
  let current: ToolHandler | undefined;
  let pointer: ToolHandler["pointer"] | undefined;
  let lastPointer: RuntimePointerEvent | undefined;
  let key = "";
  let shiftHeld = false;

  /** Publishes whether Shift currently flips Auto-select for the next press (Phase 5.3 toolbox cue). */
  const publishShiftFlip = (): void => {
    const { tool, autoSelectShiftFlip, toolOperationActive } = session.ui.getState();
    const active = current?.isActive() ?? false;
    const next = shiftHeld && toolFlipsAutoSelect(tool) && !active;
    if (next !== autoSelectShiftFlip || active !== toolOperationActive)
      session.ui.setState({ autoSelectShiftFlip: next, toolOperationActive: active });
  };

  const sync = (): void => {
    const {
      tool,
      mode,
      houseOverview,
      activeFloorId,
      focusAreaId,
      focusCarpetId,
      focusReliefId,
      focusWallFace,
      focusRoofId,
      focusRoofFace,
    } = session.ui.getState();
    const face = focusWallFace === undefined ? "" : `${focusWallFace.wallId}:${focusWallFace.side}`;
    // The active floor changes under the whole-house overview's Select (a clicked floor) without a new tool.
    const floorKey = houseOverview ? "house" : activeFloorId;
    const roofFace =
      focusRoofFace === undefined ? "" : `${String(focusRoofFace.x)},${String(focusRoofFace.y)}`;
    const next = `${tool}|${mode}|${floorKey}|${focusAreaId ?? ""}|${focusCarpetId ?? ""}|${focusReliefId ?? ""}|${face}|${focusRoofId ?? ""}|${roofFace}`;
    if (next === key) return;
    current?.cancel();
    callbacks.setOverlay([]);
    callbacks.setReadout(undefined);
    callbacks.setHint("");
    callbacks.setCue(undefined);
    callbacks.setCursor("default");
    key = next;
    lastPointer = undefined;
    // Wall tools and Orbit need the 3D view.
    if (
      ["raiseWall", "trimWall", "splitWall", "reassignWall", "orbit"].includes(tool) &&
      focusWallFace === undefined
    )
      session.ui.setState({ viewMode: "3d" });
    // Wall tools edit what they show: choosing one turns walls back on (owner, Phase 4.5).
    if (["raiseWall", "trimWall", "splitWall", "reassignWall", "fillWalls"].includes(tool))
      session.ui.setState({ wallsVisible: true });
    // In a wall face with no feature open, Select, Nudge, and Push/pull work on whole features; every other
    // tool, and all tools inside an open feature, are the shared shape tools running in face coordinates.
    const faceTool =
      focusWallFace === undefined || focusReliefId !== undefined ? undefined : faceToolFactory(tool);
    // In a roof face (19.3): its Select, Move and Roof window; the shape tools draw holes in face coordinates.
    const roofFaceTool = focusRoofFace === undefined ? undefined : roofFaceToolFactory(tool);
    faceSpace =
      (focusWallFace !== undefined && faceTool === undefined) ||
      (focusRoofFace !== undefined && roofFaceTool === undefined);
    const toolEnv = faceSpace ? faceEnv : env;
    current = (
      houseOverview
        ? houseToolFactory(tool)
        : focusRoofFace !== undefined
          ? (roofFaceTool ?? toolFactory(tool))
          : focusRoofId !== undefined
            ? roofToolFactory(tool)
            : (faceTool ?? toolFactory(tool))
    )(toolEnv);
    pointer = createToolPointer(current, toolEnv, slopTools.has(tool));
    publishShiftFlip();
  };

  /** Routes a key to the active tool; idle modifier changes re-hover so Shift/Ctrl/Alt cues refresh at once. */
  const routeKey = (event: KeyboardEvent): boolean => {
    if (
      modifierTools.has(session.ui.getState().tool) &&
      ["Shift", "Control", "Alt"].includes(event.key) &&
      current !== undefined &&
      lastPointer !== undefined
    ) {
      lastPointer = {
        ...lastPointer,
        phase: "move",
        button: -1,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      };
      // Idle (hover): refresh what Shift/Ctrl/Alt change (Shift flips Auto-select in Nudge/Rotate) without
      // consuming the key; during an operation, the key belongs to it.
      const active = current.isActive();
      current.pointer(lastPointer);
      return active;
    }
    return current?.key(event) ?? false;
  };

  sync();
  const unsubscribe = session.ui.subscribe(sync);
  return {
    pointer: (raw) => {
      const event = faceSpace ? inFaceSpace(runtime, raw) : raw;
      if (event.phase !== "leave" && event.phase !== "cancel") lastPointer = event;
      shiftHeld = event.shiftKey;
      pointer?.(event);
      publishShiftFlip();
    },
    key: (event) => {
      // On the Shift key itself, keydown/keyup say whether it is held; any other key carries the flag.
      shiftHeld = event.key === "Shift" ? event.type === "keydown" : event.shiftKey;
      const handled = routeKey(event);
      publishShiftFlip();
      return handled;
    },
    blur: () => {
      shiftHeld = false;
      publishShiftFlip();
    },
    dispose: () => {
      unsubscribe();
      current?.cancel();
      current = undefined;
      pointer = undefined;
      shiftHeld = false;
      session.ui.setState({ autoSelectShiftFlip: false, toolOperationActive: false });
    },
  };
};
