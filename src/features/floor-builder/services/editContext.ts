// One edit context stack (Phase 7.1, spec/builder/screens/floor-builder.md#editing-levels): the nested editing
// levels (room, carpet, wall face, wall feature, open object group) as one ordered path, SketchUp's edit
// contexts. The UI store keeps the levels as five `focus*` fields that many readers use; this module is the only
// writer, so the fields are always a consistent projection of one path.
//
// Whole house (Phase 16.4, owner 2026-11-18): a multi-floor house has one level above the path, the whole-house
// overview (`houseOverview`), where floors are groups. Entering a floor (double-click) leaves it; leaving the
// floor's overview (Escape, Done, a double-click outside) returns to it with that floor selected, as closing a
// SketchUp group selects it. Writing any path leaves the house level: every path level lies inside a floor.
import type { EntityRef } from "@shared/domain/house/entityIndex";
import { indexEntities } from "@shared/domain/house/entityIndex";
import { hasHouseOverview } from "@shared/domain/house/floorPlacement";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { UiState } from "../stores/uiStore";
import type { EditorSession } from "./editorSession";
import { wallFaceOf } from "./wallFace";

export type WallSide = "interior" | "exterior";

export type EditContext =
  /** A roof's editing level (Phase 19.1): the only level of its path, inside the roof's floor. */
  | Readonly<{ kind: "roof"; id: string }>
  /** A roof face view (Phase 19.3) inside the roof's level: the flat face under a plan point of the roof sheet. */
  | Readonly<{ kind: "roofFace"; roofId: string; x: number; y: number }>
  | Readonly<{ kind: "area"; id: string }>
  | Readonly<{ kind: "carpet"; id: string }>
  | Readonly<{ kind: "group"; id: string }>
  | Readonly<{ kind: "wallFace"; wallId: string; side: WallSide }>
  | Readonly<{ kind: "feature"; id: string }>;

export type EditPath = readonly EditContext[];

type FocusFields = Pick<
  UiState,
  | "mode"
  | "houseOverview"
  | "focusAreaId"
  | "focusCarpetId"
  | "focusGroupId"
  | "focusWallFace"
  | "focusReliefId"
  | "focusRoofId"
  | "focusRoofFace"
>;

/** The path the store's focus fields describe (outermost first). */
export const editPathOf = (ui: UiState): EditPath => {
  if (ui.focusRoofId !== undefined)
    return [
      { kind: "roof", id: ui.focusRoofId },
      ...(ui.focusRoofFace === undefined
        ? []
        : [
            {
              kind: "roofFace",
              roofId: ui.focusRoofId,
              x: ui.focusRoofFace.x,
              y: ui.focusRoofFace.y,
            } as const,
          ]),
    ];
  if (ui.mode === "overview" || ui.focusAreaId === undefined) return [];
  const path: EditContext[] = [{ kind: "area", id: ui.focusAreaId }];
  if (ui.focusWallFace !== undefined) {
    path.push({ kind: "wallFace", wallId: ui.focusWallFace.wallId, side: ui.focusWallFace.side });
    if (ui.focusReliefId !== undefined) path.push({ kind: "feature", id: ui.focusReliefId });
  } else if (ui.focusCarpetId !== undefined) path.push({ kind: "carpet", id: ui.focusCarpetId });
  else if (ui.focusGroupId !== undefined) path.push({ kind: "group", id: ui.focusGroupId });
  return path;
};

/** A stable string for the open path, for store selectors (an array would be a new value on every read). */
export const editPathKey = (ui: UiState): string =>
  editPathOf(ui)
    .map((context) =>
      context.kind === "wallFace"
        ? `wallFace:${context.wallId}:${context.side}`
        : context.kind === "roofFace"
          ? `roofFace:${context.roofId}:${String(context.x)}:${String(context.y)}`
          : `${context.kind}:${context.id}`,
    )
    .join("/");

/** Every focus field for a path, so a write never leaves a stale level behind. */
export const focusFieldsOf = (path: EditPath): FocusFields => {
  const fields: {
    mode: UiState["mode"];
    houseOverview: boolean;
    focusAreaId: string | undefined;
    focusCarpetId: string | undefined;
    focusGroupId: string | undefined;
    focusWallFace: UiState["focusWallFace"];
    focusReliefId: string | undefined;
    focusRoofId: string | undefined;
    focusRoofFace: UiState["focusRoofFace"];
  } = {
    mode: path.length === 0 || path[0]?.kind === "roof" ? "overview" : "area",
    houseOverview: false,
    focusAreaId: undefined,
    focusCarpetId: undefined,
    focusGroupId: undefined,
    focusWallFace: undefined,
    focusReliefId: undefined,
    focusRoofId: undefined,
    focusRoofFace: undefined,
  };
  for (const context of path) {
    if (context.kind === "roof") fields.focusRoofId = context.id;
    else if (context.kind === "roofFace") fields.focusRoofFace = { x: context.x, y: context.y };
    else if (context.kind === "area") fields.focusAreaId = context.id;
    else if (context.kind === "carpet") fields.focusCarpetId = context.id;
    else if (context.kind === "group") fields.focusGroupId = context.id;
    else if (context.kind === "wallFace")
      fields.focusWallFace = { wallId: context.wallId, side: context.side };
    else fields.focusReliefId = context.id;
  }
  return fields;
};

/** Writes a whole path (plus any other UI fields) in one store update. */
export const setEditPath = (
  session: EditorSession,
  path: EditPath,
  extra: Partial<Omit<UiState, keyof FocusFields>> = {},
): void => {
  session.ui.setState({ ...extra, ...focusFieldsOf(path) });
};

const refKindOf: Readonly<Record<EditContext["kind"], EntityRef["kind"]>> = {
  roof: "roof",
  roofFace: "roof",
  area: "area",
  carpet: "carpet",
  group: "objectGroup",
  wallFace: "wall",
  feature: "relief",
};

const contextEntityId = (context: EditContext): string =>
  context.kind === "wallFace" ? context.wallId : context.kind === "roofFace" ? context.roofId : context.id;

/**
 * The longest prefix of the path whose levels still exist in the document (after Undo, a delete, a revision
 * restore, or a floor switch). An area must be on the active floor.
 */
export const validEditPath = (house: HouseDocument, activeFloorId: string, path: EditPath): EditPath => {
  const entities = indexEntities(house);
  const valid: EditContext[] = [];
  for (const context of path) {
    const ref = entities.get(contextEntityId(context));
    if (ref?.kind !== refKindOf[context.kind]) break;
    if ((ref.kind === "area" || ref.kind === "roof") && ref.floorId !== activeFloorId) break;
    valid.push(context);
  }
  return valid;
};

/** Whether the session can leave its floor for the whole-house overview (a multi-floor house, not already there). */
export const canLeaveFloor = (session: EditorSession): boolean =>
  !session.ui.getState().houseOverview && hasHouseOverview(session.documents.getState().document);

/**
 * The whole-house overview (Phase 16.4): every open level closes and the tool returns to Select. `selection`
 * defaults to the floor that was open (SketchUp: closing a group selects it). Does nothing for a one-floor house.
 */
export const enterHouseOverview = (session: EditorSession, selection?: readonly string[]): void => {
  if (!hasHouseOverview(session.documents.getState().document)) return;
  const { activeFloorId } = session.ui.getState();
  session.ui.setState({
    ...focusFieldsOf([]),
    houseOverview: true,
    tool: "select",
    reassignWallId: undefined,
    selection: selection ?? [activeFloorId],
  });
};

/**
 * Enters a floor (a double-click on it in the whole-house overview, its tree row, or an edit inside it): the floor's
 * own overview, in the floor's local frame. Returns whether the floor or level changed.
 */
export const enterFloor = (
  session: EditorSession,
  floorId: string,
  selection: readonly string[] = [],
): boolean => {
  const ui = session.ui.getState();
  if (!session.documents.getState().document.floors.some((floor) => floor.id === floorId)) return false;
  if (!ui.houseOverview && ui.activeFloorId === floorId) return false;
  setEditPath(session, [], { activeFloorId: floorId, tool: "select", selection });
  return true;
};

/**
 * Leaves the innermost level (Done, Escape, a double-click outside, the breadcrumb): the thing you were inside
 * becomes the selection, as in SketchUp. From a floor's overview in a multi-floor house it goes to the whole-house
 * overview. Returns false when there is no level to leave.
 */
export const leaveEditLevel = (session: EditorSession): boolean => {
  const path = editPathOf(session.ui.getState());
  const inner = path[path.length - 1];
  if (inner === undefined) {
    if (!canLeaveFloor(session)) return false;
    enterHouseOverview(session);
    return true;
  }
  // A roof face view (19.3) goes back to its roof's level (Top view), nothing selected.
  if (inner.kind === "roofFace") {
    setEditPath(session, path.slice(0, -1), { tool: "select", selection: [], viewMode: "top" });
    // The roof again, fitted (the face view's camera is gone).
    session.ui.setState((state) => ({
      frameRequest: { serial: state.frameRequest.serial + 1, target: "floor" },
    }));
    return true;
  }
  // A roof is seen in the whole house only (Phase 19.1): leaving it returns there, the roof selected. A canopy
  // (19.3, an attached roof) is drawn in its floor's views too: leaving it returns to the floor, the canopy selected.
  const house = session.documents.getState().document;
  const canopy =
    inner.kind === "roof" &&
    house.floors.some((floor) => (floor.roofs ?? []).some((roof) => roof.id === inner.id && !roof.cutsWalls));
  // Leaving a roof's level (19.5) gives back the view (3D or Top) the user had before entering it.
  const { viewMode, viewModeBeforeRoof } = session.ui.getState();
  const view =
    inner.kind === "roof" ? { viewMode: viewModeBeforeRoof ?? viewMode, viewModeBeforeRoof: undefined } : {};
  if (inner.kind === "roof" && !canopy && hasHouseOverview(house)) {
    enterHouseOverview(session, [inner.id]);
    session.ui.setState(view);
    return true;
  }
  setEditPath(session, path.slice(0, -1), { tool: "select", selection: [contextEntityId(inner)], ...view });
  return true;
};

/** Leaves the open level of one kind and every level inside it, selecting what was open. */
export const leaveContextKind = (session: EditorSession, kind: EditContext["kind"]): void => {
  const path = editPathOf(session.ui.getState());
  const index = path.findIndex((context) => context.kind === kind);
  const context = path[index];
  if (context === undefined) return;
  const { viewMode, viewModeBeforeRoof } = session.ui.getState();
  setEditPath(session, path.slice(0, index), {
    tool: "select",
    selection: [contextEntityId(context)],
    ...(kind === "roof" ? { viewMode: viewModeBeforeRoof ?? viewMode, viewModeBeforeRoof: undefined } : {}),
  });
};

/** Jumps to a breadcrumb level: depth 0 is the overview, depth n keeps the first n levels. */
export const leaveToDepth = (session: EditorSession, depth: number): void => {
  let path = editPathOf(session.ui.getState());
  while (path.length > depth && leaveEditLevel(session)) path = editPathOf(session.ui.getState());
};

/** The header's name for the innermost level (the whole-house overview when `house` is set). */
export const levelName = (path: EditPath, house = false): string => {
  const inner = path[path.length - 1];
  if (house) return "Whole house";
  if (inner === undefined) return "Overview";
  return {
    roof: "Roof",
    roofFace: "Roof face",
    area: "Room Editor",
    carpet: "Carpet Editor",
    group: "Group Editor",
    wallFace: "Wall face",
    feature: "Feature Editor",
  }[inner.kind];
};

/** A breadcrumb label for one level. */
export const contextLabel = (house: HouseDocument, activeFloorId: string, context: EditContext): string => {
  if (context.kind === "wallFace")
    return wallFaceOf(house, activeFloorId, { wallId: context.wallId, side: context.side })?.label ?? "Wall";
  if (context.kind === "roofFace") return "Face";
  const ref = indexEntities(house).get(context.id);
  return ref !== undefined && "value" in ref && "name" in ref.value && typeof ref.value.name === "string"
    ? ref.value.name
    : "";
};
