// The viewport's double-click (spec/builder/screens/floor-builder.md#editing-levels), SketchUp's group entry and
// exit: one level per double-click. A double-click on something enterable opens it (whole house → floor → Room
// Editor → Carpet Editor / wall face → feature; a member of an object group opens the group); a double-click
// outside what is open goes one level back up. Inside a floor of a multi-floor house, empty space (background,
// ground, or only a measurement guide under the pointer) returns to the whole-house overview (Phase 16.13).
import { objectGroupOf } from "@shared/domain/house/entityIndex";
import type { PickHit, ScreenPoint, ViewportRuntime } from "../../../renderer/runtimeTypes";
import { featureAtFacePoint, insideFeatureBounds } from "../tools/faceTools";
import { insideOpenCarpet } from "./carpetEditorFocus";
import { canLeaveFloor, enterHouseOverview, leaveEditLevel } from "./editContext";
import type { EditorSession } from "./editorSession";
import {
  enterAreaEditor,
  enterCarpetEditor,
  enterObjectGroup,
  enterRoof,
  enterRoofFace,
  enterWallFace,
  enterWallFeature,
  fitToScreen,
  leaveCarpetEditor,
  leaveObjectGroup,
  leaveWallFace,
  leaveWallFeature,
  openFloor,
  returnToOverview,
} from "./treeActions";
import { wallFaceOf } from "./wallFace";

export type ViewportDoubleClick = Readonly<{ screen: ScreenPoint; hit: PickHit | null }>;

/**
 * Whether a double-click hit nothing that can be entered or belongs to the open floor's contents. Measurement
 * guides are drawn as lines across the whole view, so a guide under the pointer still counts as empty space.
 */
const onEmptySpace = (hit: PickHit | null): boolean => hit === null || hit.kind === "helper";

export const applyViewportDoubleClick = (
  session: EditorSession,
  event: ViewportDoubleClick,
  runtime: ViewportRuntime | null,
): void => {
  const ui = session.ui.getState();
  const house = session.documents.getState().document;
  const { hit } = event;
  if (ui.houseOverview) {
    // Whole house: a double-click on a floor opens it, on a roof its editing level (Phase 19.1); on empty space it
    // fits the house.
    if (hit?.kind === "buildingFloor") openFloor(session, hit.floorId);
    else if (hit?.kind === "roof") enterRoof(session, hit.roofId);
    else if (hit === null) fitToScreen(session);
    return;
  }
  if (ui.focusRoofFace !== undefined) {
    // In a roof face (19.3): a double-click on another face of the roof opens that face; off the roof, back to it.
    if (hit?.kind === "roof" && hit.roofId === ui.focusRoofId)
      enterRoofFace(session, hit.roofId, hit.pointMm);
    else leaveEditLevel(session);
    return;
  }
  if (ui.focusRoofId !== undefined) {
    // In a roof (Phase 19.1): a double-click on one of its faces opens the face view (19.3); off the roof it
    // leaves (back to the whole house, the roof selected).
    if (hit?.kind === "roof" && hit.roofId === ui.focusRoofId)
      enterRoofFace(session, hit.roofId, hit.pointMm);
    else leaveEditLevel(session);
    return;
  }
  // A floor view's canopy (19.3): a double-click opens its level.
  if (hit?.kind === "roof") {
    enterRoof(session, hit.roofId);
    return;
  }
  const areaId = hit !== null && "areaId" in hit ? hit.areaId : undefined;
  const carpetId = hit?.kind === "carpet" ? hit.carpetId : undefined;
  const wallHit = hit?.kind === "wall" ? hit : undefined;
  const memberId = hit?.kind === "object" ? hit.instanceId : hit?.kind === "light" ? hit.lightId : carpetId;
  const grouped = memberId === undefined ? undefined : objectGroupOf(house, memberId);
  const member = grouped === undefined ? undefined : { id: grouped.memberId, group: grouped.group };
  if (
    ui.mode !== "overview" &&
    ui.focusWallFace === undefined &&
    member !== undefined &&
    member.group.id !== ui.focusGroupId
  ) {
    // Double-click a member of a group: open the group, so its members select and move one by one.
    enterObjectGroup(session, member.group.id, member.id);
  } else if (
    ui.focusGroupId !== undefined &&
    ui.focusWallFace === undefined &&
    member?.group.id !== ui.focusGroupId
  ) {
    // A double-click away from the open group closes it again.
    leaveObjectGroup(session);
  } else if (ui.mode === "overview" && areaId !== undefined) enterAreaEditor(session, areaId);
  else if (ui.focusWallFace !== undefined) {
    // In a face view: a double-click on a feature opens it, one off the open feature leaves it, and one
    // away from the wall goes back to the Room Editor.
    const point = runtime?.facePointAt(event.screen.x, event.screen.y) ?? null;
    const face = wallFaceOf(house, ui.activeFloorId, ui.focusWallFace);
    const onWall =
      point !== null &&
      face !== undefined &&
      point.alongMm >= 0 &&
      point.alongMm <= face.lengthMm &&
      point.heightMm >= 0 &&
      point.heightMm <= face.heightMm;
    const featureAt =
      point === null || face === undefined
        ? undefined
        : featureAtFacePoint(face, { x: point.alongMm, y: point.heightMm });
    if (ui.focusReliefId !== undefined) {
      const margin = runtime === null ? 0 : 12 * runtime.worldUnitsPerPixel();
      const open = face?.reliefs.find((relief) => relief.id === ui.focusReliefId);
      if (
        point === null ||
        open === undefined ||
        !insideFeatureBounds(open, { x: point.alongMm, y: point.heightMm }, margin)
      )
        leaveWallFeature(session);
    } else if (featureAt !== undefined) enterWallFeature(session, featureAt.id);
    else if (!onWall) leaveWallFace(session);
  } else if (
    ui.mode !== "overview" &&
    ui.focusCarpetId === undefined &&
    wallHit !== undefined &&
    wallHit.areaId === ui.focusAreaId
  )
    // Room Editor: double-click a wall face to open it straight on (Phase 5.1).
    enterWallFace(session, wallHit.wallId, wallHit.side === "exterior" ? "exterior" : "interior");
  else if (ui.focusCarpetId !== undefined) {
    if (carpetId !== ui.focusCarpetId && !insideOpenCarpet(session, event.screen, runtime))
      leaveCarpetEditor(session);
  } else if (ui.mode !== "overview" && areaId === ui.focusAreaId && carpetId !== undefined)
    enterCarpetEditor(session, carpetId);
  else if (ui.mode !== "overview" && areaId !== ui.focusAreaId) returnToOverview(session);
  else if (ui.mode === "overview" && onEmptySpace(hit)) {
    // Outside everything in the open floor of a multi-floor house: back to the whole house (SketchUp: a
    // double-click outside the open group closes it); a one-floor house has no level above and fits.
    if (canLeaveFloor(session)) enterHouseOverview(session);
    else fitToScreen(session);
  }
};
