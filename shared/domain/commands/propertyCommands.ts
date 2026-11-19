// setProperty: the property panel's one command (D18). Multi-selection writes all targets in one entry.
import { indexEntities } from "../house/entityIndex";
import { applyLightPropertyRules } from "../lighting/lampTypes";
import { applyLightMountRules } from "../lighting/wallMount";
import type { HouseDocument } from "../schemas/house";
import { defineCommand } from "./command";
import type { Command } from "./command";
import { resolveDraftPath, setAtPropertyPath } from "./draftPath";

export const setPropertyCommand = (
  house: HouseDocument,
  entityIds: readonly string[],
  path: readonly string[],
  value: unknown,
  label: string,
): Command => {
  const entities = indexEntities(house);
  const refs = entityIds.map((id) => entities.get(id));
  const first = refs[0];
  const floorId = first === undefined || first.kind === "house" ? undefined : first.floorId;
  return defineCommand(label, floorId, (draft) => {
    for (const [index, ref] of refs.entries()) {
      if (ref === undefined) return `The selected object ${entityIds[index] ?? ""} no longer exists.`;
      const target = resolveDraftPath(draft, ref.path);
      if (!setAtPropertyPath(target, path, value)) return "This property cannot be changed.";
      if (ref.kind === "light") {
        applyLightPropertyRules(target, path);
        const area = draft.floors
          .find((floor) => floor.id === ref.floorId)
          ?.areas.find((candidate) => candidate.id === ref.areaId);
        if (area !== undefined) applyLightMountRules(area, target, path);
      }
    }
    return undefined;
  });
};

/** Several properties of one entity in one undo step (a handle resize that also moves the thing). */
export const setPropertiesCommand = (
  house: HouseDocument,
  entityId: string,
  updates: readonly Readonly<{ path: readonly string[]; value: unknown }>[],
  label: string,
): Command => {
  const ref = indexEntities(house).get(entityId);
  const floorId = ref === undefined || ref.kind === "house" ? undefined : ref.floorId;
  return defineCommand(label, floorId, (draft) => {
    if (ref === undefined) return `The selected object ${entityId} no longer exists.`;
    const target = resolveDraftPath(draft, ref.path);
    for (const update of updates)
      if (!setAtPropertyPath(target, update.path, update.value)) return "This property cannot be changed.";
    return undefined;
  });
};
