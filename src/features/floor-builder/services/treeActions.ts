// What tree rows do (spec/builder/screens/floor-builder.md#selection-focus-and-mode-changes).
import { circleArcEdgeKey } from "@shared/geometry/shapeOutline";
import { addAreaCommand, addYardCommand } from "@shared/domain/commands/areaCommands";
import { addFloorCommand } from "@shared/domain/commands/floorCommands";
import { indexEntities } from "@shared/domain/house/entityIndex";
import type { CameraPreset, FrameRequestTarget } from "../stores/uiStore";
import type { EditorSession } from "./editorSession";
import { parseSyntheticRow } from "./houseTree";
import type { TreeMagnifier } from "./houseTree";
import { runAddHandler } from "./addHandlers";
import { hasHouseOverview } from "@shared/domain/house/floorPlacement";
import { editPathOf, enterFloor, enterHouseOverview, leaveContextKind, setEditPath } from "./editContext";

const expand = (session: EditorSession, ids: readonly string[]): void => {
  session.ui.setState((state) => ({ expanded: [...new Set([...state.expanded, ...ids])] }));
};

export const requestFrame = (session: EditorSession, target: FrameRequestTarget): void => {
  session.ui.setState((state) => ({ frameRequest: { serial: state.frameRequest.serial + 1, target } }));
};

export const activateFloor = (session: EditorSession, floorId: string): void => {
  const { activeFloorId, houseOverview } = session.ui.getState();
  if (activeFloorId === floorId) return;
  // In the whole-house overview every floor is shown: the active floor changes, the level stays (Phase 16.4).
  if (houseOverview) {
    session.ui.setState({ activeFloorId: floorId });
    return;
  }
  setEditPath(session, [], { activeFloorId: floorId, tool: "select" });
  requestFrame(session, "floor");
};

/** Opens a floor from the whole-house overview (double-click, tree Enter) and frames it. */
export const openFloor = (session: EditorSession, floorId: string): void => {
  if (enterFloor(session, floorId)) requestFrame(session, "floor");
};

export const enterAreaEditor = (session: EditorSession, areaId: string): void => {
  if (outsideEditedArea(session, areaId)) return;
  const ref = indexEntities(session.documents.getState().document).get(areaId);
  if (ref?.kind !== "area") return;
  activateFloor(session, ref.floorId);
  setEditPath(session, [{ kind: "area", id: areaId }], {
    tool: "select",
    selection: [areaId],
    expanded: [...new Set([...session.ui.getState().expanded, ref.floorId, areaId])],
  });
  requestFrame(session, "focus");
};

/**
 * A roof's editing level (Phase 19.1, spec/builder/features/roofs.md#the-roof-editing-level): the roof over its floor,
 * seen from the top, its points and break lines editable. Entered by a double-click on the roof in the whole-house
 * overview, or a double-click / Enter on its tree row; leaving returns to the whole house with the roof selected.
 */
export const enterRoof = (session: EditorSession, roofId: string): void => {
  const ref = indexEntities(session.documents.getState().document).get(roofId);
  if (ref?.kind !== "roof") return;
  const ui = session.ui.getState();
  setEditPath(session, [{ kind: "roof", id: roofId }], {
    activeFloorId: ref.floorId,
    tool: "select",
    selection: [],
    viewMode: "top",
    // Leaving the roof gives back the view the user had (19.5); a roof entered from another roof keeps the first.
    viewModeBeforeRoof: ui.focusRoofId === undefined ? ui.viewMode : ui.viewModeBeforeRoof,
    expanded: [...new Set([...session.ui.getState().expanded, ref.floorId])],
  });
  requestFrame(session, "floor");
};

/**
 * A roof face view (Phase 19.3, spec/builder/features/roofs.md#the-roof-face-view): one level inside the roof's,
 * looking straight at the flat face under `at` (plan, floor frame) to draw holes and place roof windows. Entered by
 * a double-click on a face in the roof's level; Done, Escape or a double-click off the face go back to the roof.
 */
export const enterRoofFace = (
  session: EditorSession,
  roofId: string,
  at: Readonly<{ x: number; y: number }>,
): void => {
  const ref = indexEntities(session.documents.getState().document).get(roofId);
  if (ref?.kind !== "roof") return;
  setEditPath(
    session,
    [
      { kind: "roof", id: roofId },
      { kind: "roofFace", roofId, x: Math.round(at.x), y: Math.round(at.y) },
    ],
    { activeFloorId: ref.floorId, tool: "select", selection: [], viewMode: "3d" },
  );
};

/** Done: leave the editor keeping every edit (each stays its own undo step). */
export const returnToOverview = (session: EditorSession): void => {
  const { focusAreaId } = session.ui.getState();
  setEditPath(session, [], {
    ...(focusAreaId === undefined ? {} : { selection: [focusAreaId] }),
    tool: "select",
  });
};

/**
 * Wall face view (Phase 5.1): one level inside the Room Editor, looking straight at one face of one of the
 * room's straight walls to draw and push its boxes and niches. Entered by double-clicking the wall in the
 * Room Editor or from its tree row (entering its room first); curved walls are not supported.
 */
export const enterWallFace = (
  session: EditorSession,
  wallId: string,
  side: "interior" | "exterior" = "interior",
): void => {
  const ref = indexEntities(session.documents.getState().document).get(wallId);
  if (ref?.kind !== "wall") return;
  if (ref.value.sourceEdge.edge === circleArcEdgeKey) {
    session.notify("info", "Boxes and niches on curved walls are not supported yet.");
    return;
  }
  const { mode, focusAreaId } = session.ui.getState();
  if (mode === "area" && focusAreaId !== ref.areaId) return;
  if (mode !== "area") enterAreaEditor(session, ref.areaId);
  setEditPath(
    session,
    [
      { kind: "area", id: ref.areaId },
      { kind: "wallFace", wallId, side },
    ],
    { tool: "select", viewMode: "3d", selection: [] },
  );
};

export const leaveWallFace = (session: EditorSession): void => {
  leaveContextKind(session, "wallFace");
};

/** The face view's Interior / Exterior switch. */
export const setWallFaceSide = (session: EditorSession, side: "interior" | "exterior"): void => {
  const { focusWallFace } = session.ui.getState();
  if (focusWallFace === undefined || focusWallFace.side === side) return;
  setEditPath(
    session,
    [
      ...editPathOf(session.ui.getState()).filter((context) => context.kind === "area"),
      { ...focusWallFace, kind: "wallFace", side },
    ],
    { selection: [] },
  );
};

/**
 * Carpet Editor (Phase 5.14): one level inside the Room Editor, editing one carpet's pieces with the shape
 * tools. Entered by double-clicking the carpet in the Room Editor or from its tree row (entering its room
 * first). Leaving returns to the Room Editor with the carpet selected.
 */
export const enterCarpetEditor = (session: EditorSession, carpetId: string): void => {
  const ref = indexEntities(session.documents.getState().document).get(carpetId);
  if (ref?.kind !== "carpet") return;
  const { mode, focusAreaId } = session.ui.getState();
  if (mode === "area" && focusAreaId !== ref.areaId) return;
  if (mode !== "area") enterAreaEditor(session, ref.areaId);
  setEditPath(
    session,
    [
      { kind: "area", id: ref.areaId },
      { kind: "carpet", id: carpetId },
    ],
    {
      tool: "select",
      selection:
        ref.value.shapes.length === 1 && ref.value.shapes[0] !== undefined ? [ref.value.shapes[0].id] : [],
      expanded: [...new Set([...session.ui.getState().expanded, ref.areaId])],
    },
  );
};

export const leaveCarpetEditor = (session: EditorSession): void => {
  leaveContextKind(session, "carpet");
};

/**
 * Wall feature editing (wall relief groups): one level inside the wall face view, editing one feature's shapes
 * with the shared shape tools. Entered by double-clicking the feature on the face or from its tree row
 * (entering its room and face first). Leaving returns to the face view with the feature selected.
 */
export const enterWallFeature = (session: EditorSession, reliefId: string): void => {
  const ref = indexEntities(session.documents.getState().document).get(reliefId);
  if (ref?.kind !== "relief") return;
  const { mode, focusAreaId } = session.ui.getState();
  if (mode === "area" && focusAreaId !== ref.areaId) return;
  if (mode !== "area") enterAreaEditor(session, ref.areaId);
  setEditPath(
    session,
    [
      { kind: "area", id: ref.areaId },
      { kind: "wallFace", wallId: ref.wallId, side: ref.value.face },
      { kind: "feature", id: reliefId },
    ],
    {
      tool: "select",
      viewMode: "3d",
      selection:
        ref.value.shapes.length === 1 && ref.value.shapes[0] !== undefined ? [ref.value.shapes[0].id] : [],
      expanded: [...new Set([...session.ui.getState().expanded, ref.areaId, ref.wallId])],
    },
  );
};

export const leaveWallFeature = (session: EditorSession): void => {
  leaveContextKind(session, "feature");
};

/** Opens an object group (double-click a member): its members then select and move one by one. */
export const enterObjectGroup = (session: EditorSession, groupId: string, memberId: string): void => {
  const ref = indexEntities(session.documents.getState().document).get(groupId);
  if (ref?.kind !== "objectGroup") return;
  const { mode, focusAreaId } = session.ui.getState();
  if (mode !== "area" || focusAreaId !== ref.areaId) return;
  setEditPath(
    session,
    [
      { kind: "area", id: ref.areaId },
      { kind: "group", id: groupId },
    ],
    { selection: [memberId] },
  );
};

export const leaveObjectGroup = (session: EditorSession): void => {
  leaveContextKind(session, "group");
};

/** A row name click: select, with the documented special cases for floors and the Walls group. */
/** While an editor session is open, only rows of the focused area respond. */
const outsideEditedArea = (session: EditorSession, rowId: string): boolean => {
  const { mode, focusAreaId } = session.ui.getState();
  if (mode === "overview" || focusAreaId === undefined) return false;
  const synthetic = parseSyntheticRow(rowId);
  const ref = indexEntities(session.documents.getState().document).get(synthetic?.ownerId ?? rowId);
  if (ref === undefined || ref.kind === "house" || ref.kind === "floor") return true;
  return !("areaId" in ref) || ref.areaId !== focusAreaId;
};

export const selectRow = (session: EditorSession, rowId: string): void => {
  if (outsideEditedArea(session, rowId)) return;
  const synthetic = parseSyntheticRow(rowId);
  const house = session.documents.getState().document;
  if (synthetic !== undefined) {
    if (synthetic.kind === "walls") {
      const area = indexEntities(house).get(synthetic.ownerId);
      if (area?.kind !== "area") return;
      session.ui.setState({ selection: area.value.walls.map((wall) => wall.id) });
      return;
    }
    if (synthetic.kind === "lights" || synthetic.kind === "objects") {
      const area = indexEntities(house).get(synthetic.ownerId);
      if (area?.kind === "area")
        session.ui.setState({
          selection:
            synthetic.kind === "lights"
              ? area.value.lights.map((light) => light.id)
              : area.value.objects.map((object) => object.id),
        });
      return;
    }
    return;
  }
  const ref = indexEntities(house).get(rowId);
  if (ref === undefined) return;
  // Selecting House returns to the whole-house overview of a multi-floor house (Phase 16.4).
  if (ref.kind === "house" && hasHouseOverview(house)) {
    enterHouseOverview(session, [rowId]);
    return;
  }
  if (ref.kind === "floor") activateFloor(session, ref.id);
  else if (
    ref.kind === "roof" ||
    ref.kind === "roofPoint" ||
    ref.kind === "roofLine" ||
    ref.kind === "roofHole" ||
    ref.kind === "roofWindow"
  ) {
    // Roofs are seen in the whole house (Phase 19.1): selecting one there keeps the level; from inside a floor it
    // returns to the whole house with the roof selected. Inside the roof's own level its parts select in place.
    const { focusRoofId } = session.ui.getState();
    const roofId = ref.kind === "roof" ? ref.id : ref.roofId;
    // A canopy (19.3, attached) is drawn in its floor's views too: it selects there, on its floor.
    const canopy = (house.floors.find((floor) => floor.id === ref.floorId)?.roofs ?? []).some(
      (roof) => roof.id === roofId && !roof.cutsWalls,
    );
    if (canopy && focusRoofId !== roofId && !session.ui.getState().houseOverview) {
      if (ref.floorId !== session.ui.getState().activeFloorId) activateFloor(session, ref.floorId);
      if (session.ui.getState().focusAreaId !== undefined) returnToOverview(session);
    } else if (focusRoofId !== roofId && !session.ui.getState().houseOverview && hasHouseOverview(house)) {
      enterHouseOverview(session, [roofId]);
      return;
    }
    if (session.ui.getState().houseOverview) session.ui.setState({ activeFloorId: ref.floorId });
  } else if (ref.kind !== "house" && session.ui.getState().houseOverview)
    // Something inside a floor: SketchUp's outliner opens the context that holds it.
    openFloor(session, ref.floorId);
  else if (ref.kind !== "house" && ref.floorId !== session.ui.getState().activeFloorId)
    activateFloor(session, ref.floorId);
  session.ui.setState({ selection: [rowId] });
};

export const runMagnifier = (session: EditorSession, action: TreeMagnifier, rowId: string): void => {
  if (outsideEditedArea(session, rowId)) return;
  const house = session.documents.getState().document;
  const ref = indexEntities(house).get(rowId);
  if (action === "frameFloor" && ref?.kind === "house" && hasHouseOverview(house)) {
    // The house row's frame: the whole-house overview, fitted.
    enterHouseOverview(session, [ref.id]);
    requestFrame(session, "floor");
  } else if (action === "frameFloor") {
    returnToOverview(session);
    requestFrame(session, "floor");
  } else if (action === "activateFloor" && ref?.kind === "floor") {
    activateFloor(session, ref.id);
    returnToOverview(session);
    requestFrame(session, "floor");
  } else if (action === "frameArea" && ref?.kind === "area") {
    // Fit only: the room is framed and selected, the others stay as they are (owner, 2026-11-15).
    activateFloor(session, ref.floorId);
    session.ui.setState({ selection: [ref.id] });
    requestFrame(session, "selection");
  }
};

/** Fit to screen: the whole floor in the overview, the edited area in an editor. */
export const fitToScreen = (session: EditorSession): void => {
  requestFrame(session, session.ui.getState().mode === "overview" ? "floor" : "focus");
};

/** Look straight down or turn the view 90° (3D moves that switch from Top themselves); the viewport then fits. */
export const requestCameraPreset = (session: EditorSession, preset: CameraPreset): void => {
  session.ui.setState((state) => ({ cameraRequest: { serial: state.cameraRequest.serial + 1, preset } }));
};

export const runAdd = (session: EditorSession, itemId: string, rowId: string): void => {
  if (outsideEditedArea(session, rowId)) return;
  const house = session.documents.getState().document;
  if (itemId === "add:floor") {
    const { command, floorId } = addFloorCommand(house);
    if (session.execute(command).ok) {
      activateFloor(session, floorId);
      session.ui.setState({ selection: [floorId] });
      expand(session, [house.id, floorId]);
    }
    return;
  }
  if (itemId === "add:area") {
    const { command, areaId } = addAreaCommand(house, rowId, session.ui.getState().viewCenterMm);
    if (session.execute(command).ok) {
      activateFloor(session, rowId);
      expand(session, [rowId, areaId]);
      enterAreaEditor(session, areaId);
      session.ui.setState({ tool: "rectangle" });
    }
    return;
  }
  if (itemId === "add:yard") {
    // Phase 17.2: an 8 × 6 m lawn with fences against the south of the ground floor's rooms, selected.
    const { command, areaId } = addYardCommand(house, rowId, session.ui.getState().viewCenterMm);
    if (session.execute(command).ok) {
      activateFloor(session, rowId);
      expand(session, [rowId, areaId]);
      session.ui.setState({ selection: [areaId] });
    }
    return;
  }
  runAddHandler(session, itemId, rowId);
};
