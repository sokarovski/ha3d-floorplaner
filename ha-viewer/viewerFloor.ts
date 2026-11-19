// What of a floor the HA viewer shows (Phase 7.5; owner, 2026-11-17): the builder's visibility rule with no
// session hides (`viewerVisibility`), and saved-Hidden lights left out entirely. In the builder a hidden light
// keeps shining without its fixture; here Hidden means "there, but not in use right now", so a hidden light
// gives no light, has no fixture, bubbles, or Settings row. The 3D view and the Settings list share this floor.
import { floorView, viewerVisibility } from "@shared/domain/house/visibility";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";

export const viewerFloor = (floor: BuildingFloorValue): BuildingFloorValue => {
  const view = floorView(floor, viewerVisibility);
  const concealed = view.concealedLightIds;
  if (concealed.size === 0) return view.floor;
  return {
    ...view.floor,
    areas: view.floor.areas.map((area) =>
      area.lights.some((light) => concealed.has(light.id))
        ? { ...area, lights: area.lights.filter((light) => !concealed.has(light.id)) }
        : area,
    ),
  };
};
