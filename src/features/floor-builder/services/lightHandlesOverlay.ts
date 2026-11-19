// The handles of the selected lights (Phase 5.12), drawn in both modes while no handle operation runs.
import { indexEntities } from "@shared/domain/house/entityIndex";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { OverlayPrimitive } from "../../../renderer/runtimeTypes";
import { lightHandlesOverlay } from "../tools/lightSelectOps";

export const selectedLightsHandlesOverlay = (
  house: HouseDocument,
  selection: readonly string[],
  mmPerPx: number,
  topView: boolean,
): readonly OverlayPrimitive[] => {
  const entities = indexEntities(house);
  return selection.flatMap((id) => {
    const ref = entities.get(id);
    if (ref?.kind !== "light") return [];
    const host = entities.get(ref.areaId);
    return host?.kind === "area" ? lightHandlesOverlay(host.value, ref.value, mmPerPx, topView) : [];
  });
};
