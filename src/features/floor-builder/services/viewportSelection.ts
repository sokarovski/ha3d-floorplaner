// Maps the editor selection to viewport highlights and framing bounds. Walls highlight only when a wall itself
// is selected (Phase 15.8): a selected door, window, or wall-hung object is drawn with its own box.
import { indexEntities } from "@shared/domain/house/entityIndex";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { ViewportSelection } from "../../../renderer/runtimeTypes";

export const viewportSelectionFor = (
  house: HouseDocument,
  selection: readonly string[],
): ViewportSelection => {
  const entities = indexEntities(house);
  const wallIds: string[] = [];
  const areaIds: string[] = [];
  const lightIds: string[] = [];
  const effectIds: string[] = [];
  const preferredWallIds: string[] = [];
  for (const id of selection) {
    const ref = entities.get(id);
    if (ref === undefined) continue;
    if (ref.kind === "wall") wallIds.push(ref.id);
    else if (ref.kind === "area") areaIds.push(ref.id);
    // A carpet piece is shown by its own overlay, never by highlighting its room's floor (Phase 5.14).
    else if (
      ref.kind === "floorSurface" ||
      (ref.kind === "shape" && ref.carpetId === undefined && ref.reliefId === undefined)
    )
      areaIds.push(ref.areaId);
    // A door or window shows its own box (objectSelectionOverlay.ts), never its wall's highlight (Phase 15.8);
    // its wall only stays preferred where a wall-top pick is ambiguous.
    else if (ref.kind === "opening") preferredWallIds.push(ref.wallId);
    else if (ref.kind === "light") lightIds.push(ref.id);
    // A selected effect, or an object with effects, plays its effects once (D24 preview).
    else if (ref.kind === "effect") effectIds.push(ref.id);
    else if (ref.kind === "object" && (ref.value.effects ?? []).length > 0) effectIds.push(ref.id);
    // A selected light group highlights its member lights (Phase 7.3; spec/builder/features/lighting.md).
    else if (ref.kind === "lightGroup") lightIds.push(...ref.value.memberIds);
    // An object group's lights take the selection accent with the group.
    else if (ref.kind === "objectGroup")
      lightIds.push(...ref.value.memberIds.filter((memberId) => entities.get(memberId)?.kind === "light"));
  }
  return {
    wallIds,
    areaIds: [...new Set(areaIds)],
    lightIds,
    effectIds,
    ...(preferredWallIds.length === 0 ? {} : { preferredWallIds: [...new Set(preferredWallIds)] }),
  };
};

/** Areas whose bounds should be framed for the selection (or the focus area). */
export const selectionAreaIds = (
  house: HouseDocument,
  selection: readonly string[],
  focusAreaId: string | undefined,
): readonly string[] => {
  const entities = indexEntities(house);
  const ids = new Set<string>();
  for (const id of selection) {
    const ref = entities.get(id);
    if (
      ref !== undefined &&
      ref.kind !== "house" &&
      ref.kind !== "floor" &&
      ref.kind !== "lightGroup" &&
      ref.kind !== "guide" &&
      "areaId" in ref
    )
      ids.add(ref.areaId);
  }
  if (ids.size === 0 && focusAreaId !== undefined) ids.add(focusAreaId);
  return [...ids];
};
