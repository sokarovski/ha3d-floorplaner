// Generic delete by stable ID for every list-held entity, with reference cleanup (light groups).
import type { Draft } from "immer";
import { indexEntities } from "../house/entityIndex";
import type { HouseDocument } from "../schemas/house";
import { defineCommand } from "./command";
import type { Command } from "./command";
import { pruneObjectGroups } from "./objectGroupCommands";
import { resolveDraftPath } from "./draftPath";
import { deleteFromSheet } from "../../geometry/roofSheet";

const removeFromParentList = (draft: Draft<HouseDocument>, path: readonly (string | number)[]): boolean => {
  const index = path[path.length - 1];
  if (typeof index !== "number") return false;
  const list = resolveDraftPath(draft, path.slice(0, -1));
  if (!Array.isArray(list)) return false;
  list.splice(index, 1);
  return true;
};

export const deleteEntitiesCommand = (house: HouseDocument, ids: readonly string[]): Command => {
  const entities = indexEntities(house);
  const all = ids.map((id) => entities.get(id)).filter((ref) => ref !== undefined);
  // Roof points and break lines (Phase 19.1) are removed through the roof's sheet (the lines on a deleted point go
  // with it, loose points are tidied), unless their whole roof is deleted too.
  const deletedRoofs = new Set(all.flatMap((ref) => (ref.kind === "roof" ? [ref.id] : [])));
  const sheetParts = all.filter(
    (ref) => (ref.kind === "roofPoint" || ref.kind === "roofLine") && !deletedRoofs.has(ref.roofId),
  );
  // Holes and roof windows (19.3) are list entries of their roof: removed by path (with their roof, or alone).
  const refs = all.filter(
    (ref) =>
      ref.kind !== "roofPoint" &&
      ref.kind !== "roofLine" &&
      !((ref.kind === "roofHole" || ref.kind === "roofWindow") && deletedRoofs.has(ref.roofId)),
  );
  const first = all[0];
  const label =
    all.length === 1 && first !== undefined
      ? `Delete ${first.kind === "area" || first.kind === "light" || first.kind === "object" || first.kind === "opening" || first.kind === "carpet" || first.kind === "roof" || first.kind === "roofHole" || first.kind === "roofWindow" ? first.value.name : first.kind === "roofPoint" ? "roof point" : first.kind === "roofLine" ? "break line" : first.kind}`
      : `Delete ${String(all.length)} items`;
  const floorId = first === undefined || first.kind === "house" ? undefined : first.floorId;
  // Delete deepest/last paths first so earlier indexes stay valid.
  const ordered = [...refs].sort((a, b) => compareIndexPaths(b.path, a.path));
  return defineCommand(label, floorId, (draft) => {
    const roofIds = new Set(
      sheetParts.flatMap((ref) => (ref.kind === "roofPoint" || ref.kind === "roofLine" ? [ref.roofId] : [])),
    );
    for (const roofId of roofIds) {
      const roof = draft.floors
        .flatMap((floor) => floor.roofs ?? [])
        .find((candidate) => candidate.id === roofId);
      if (roof === undefined) continue;
      const result = deleteFromSheet(
        roof,
        sheetParts.flatMap((ref) => (ref.kind === "roofPoint" && ref.roofId === roofId ? [ref.id] : [])),
        sheetParts.flatMap((ref) => (ref.kind === "roofLine" && ref.roofId === roofId ? [ref.id] : [])),
      );
      if (!result.ok) return result.message;
      roof.points = result.sheet.points.map((point) => ({ ...point }));
      roof.outline = [...result.sheet.outline];
      roof.lines = result.sheet.lines.map((line) => ({ ...line }));
    }
    for (const ref of ordered) {
      if (ref.kind === "house" || ref.kind === "floor")
        return "Use the floor or house actions to delete this.";
      if (ref.kind === "floorSurface") return "The area's floor cannot be deleted on its own.";
      if (!removeFromParentList(draft, ref.path)) return "The item could not be removed.";
      if (ref.kind === "light") {
        for (const floor of draft.floors)
          for (const group of floor.lightGroups)
            group.memberIds = group.memberIds.filter((member) => member !== ref.id);
      }
      if (ref.kind === "area") {
        const lightIds = new Set(ref.value.lights.map((light) => light.id));
        for (const floor of draft.floors)
          for (const group of floor.lightGroups)
            group.memberIds = group.memberIds.filter((member) => !lightIds.has(member));
      }
    }
    pruneObjectGroups(draft);
    // A feature keeps at least one shape: delete the feature itself instead.
    for (const ref of ordered) {
      if (ref.kind !== "shape" || ref.reliefId === undefined) continue;
      const feature = draft.floors
        .find((floor) => floor.id === ref.floorId)
        ?.areas.find((area) => area.id === ref.areaId)
        ?.walls.flatMap((wall) => wall.reliefs ?? [])
        .find((candidate) => candidate.id === ref.reliefId);
      if (feature?.shapes.length === 0)
        return "A wall feature needs at least one shape. Delete the feature itself from the tree instead.";
    }
    // A carpet keeps at least one piece (Phase 5.14): delete the carpet itself instead.
    for (const ref of ordered) {
      if (ref.kind !== "shape" || ref.carpetId === undefined) continue;
      const carpet = draft.floors
        .find((floor) => floor.id === ref.floorId)
        ?.areas.find((area) => area.id === ref.areaId)
        ?.floor.carpets.find((candidate) => candidate.id === ref.carpetId);
      if (carpet?.shapes.length === 0)
        return "A carpet needs at least one piece. Delete the carpet itself from the tree instead.";
    }
    return undefined;
  });
};

const compareIndexPaths = (a: readonly (string | number)[], b: readonly (string | number)[]): number => {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (typeof x === "number" && typeof y === "number" && x !== y) return x - y;
    if (x !== y) return String(x).localeCompare(String(y));
  }
  return a.length - b.length;
};
