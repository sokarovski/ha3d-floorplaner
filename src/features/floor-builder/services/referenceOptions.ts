// Options for the reference editor: walls of the selected object's area, lights on the active floor.
import { indexEntities } from "@shared/domain/house/entityIndex";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { ReferenceOption } from "../domain-editors/domainEditorData";
import { wallLabel } from "./labels";

export const referenceOptionsFor = (
  house: HouseDocument,
  floorId: string,
  selection: readonly string[],
  kind: string,
): readonly ReferenceOption[] => {
  const floor = house.floors.find((candidate) => candidate.id === floorId);
  if (floor === undefined) return [];
  if (kind === "light")
    return floor.areas.flatMap((area) =>
      area.lights.map((light) => ({ id: light.id, label: `${light.name} · ${area.name}` })),
    );
  if (kind === "object") {
    const entities = indexEntities(house);
    const first = selection[0] === undefined ? undefined : entities.get(selection[0]);
    const areaId = first?.kind === "objectGroup" ? first.areaId : undefined;
    return floor.areas
      .filter((area) => areaId === undefined || area.id === areaId)
      .flatMap((area) => [
        ...area.objects
          .filter((object) => object.attachment.host !== "wall")
          .map((object) => ({ id: object.id, label: `${object.name} · ${area.name}` })),
        // A group's members may also be the room's lights and carpets (Phase 7.3).
        ...(areaId === undefined
          ? []
          : [
              ...area.lights.map((light) => ({ id: light.id, label: `${light.name} · light` })),
              ...area.floor.carpets.map((carpet) => ({ id: carpet.id, label: `${carpet.name} · carpet` })),
            ]),
      ]);
  }
  if (kind === "wall") {
    const entities = indexEntities(house);
    const first = selection[0] === undefined ? undefined : entities.get(selection[0]);
    const areaId =
      first !== undefined &&
      first.kind !== "house" &&
      first.kind !== "floor" &&
      first.kind !== "lightGroup" &&
      first.kind !== "guide" &&
      "areaId" in first
        ? first.areaId
        : undefined;
    const areas = floor.areas.filter((area) => areaId === undefined || area.id === areaId);
    return areas.flatMap((area) =>
      area.walls.map((wall, index) => ({
        id: wall.id,
        label: `${wallLabel(area, wall, index)} · ${area.name}`,
      })),
    );
  }
  return [];
};
