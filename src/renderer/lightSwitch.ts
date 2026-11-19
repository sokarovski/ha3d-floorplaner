// Lights off (Phase 7.9, owner: "all lights off, not just hide them"): the floor as the lights layer should draw
// it with every artificial light switched off, so emitters, shadows, and the glow of strips and placeholders go
// dark while fixtures and pins stay. The off copies are cached per authored light, so the lights layer (which
// rebuilds a light only when its value changes) does not rebuild on every sync.
import type { AreaValue } from "@shared/domain/schemas/area";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { LightValue } from "@shared/domain/schemas/light";

const offLights = new WeakMap<LightValue, LightValue>();
const offAreas = new WeakMap<AreaValue, AreaValue>();
const offFloors = new WeakMap<BuildingFloorValue, BuildingFloorValue>();

const lightOff = (light: LightValue): LightValue => {
  if (!light.defaults.enabled) return light;
  const cached = offLights.get(light);
  if (cached !== undefined) return cached;
  const off: LightValue = { ...light, defaults: { ...light.defaults, enabled: false } };
  offLights.set(light, off);
  return off;
};

const areaOff = (area: AreaValue): AreaValue => {
  if (area.lights.length === 0) return area;
  const cached = offAreas.get(area);
  if (cached !== undefined) return cached;
  const off: AreaValue = { ...area, lights: area.lights.map(lightOff) };
  offAreas.set(area, off);
  return off;
};

/** The floor with all its lights off (the same object when it has no lights on). */
export const floorWithLightsOff = (floor: BuildingFloorValue): BuildingFloorValue => {
  const cached = offFloors.get(floor);
  if (cached !== undefined) return cached;
  const off: BuildingFloorValue = { ...floor, areas: floor.areas.map(areaOff) };
  offFloors.set(floor, off);
  return off;
};
