// Carpets, lights, and light groups (spec/builder/features/materials-and-objects.md §6, lighting.md, D08).
import { defaultFlooring } from "../house/defaults";
import { createId } from "../ids";
import { mountOnNearestWall, snapToWallMount } from "../lighting/wallMount";
import type { CarpetValue } from "../schemas/carpet";
import type { HouseDocument } from "../schemas/house";
import type { LightGroupValue, LightValue } from "../schemas/light";
import type { Vector2 } from "../schemas/values";
import { defineCommand } from "./command";
import type { Command } from "./command";
import { nextFreeName } from "./naming";

const findArea = (house: HouseDocument, floorId: string, areaId: string) =>
  house.floors.find((floor) => floor.id === floorId)?.areas.find((area) => area.id === areaId);

export const addCarpetCommand = (
  house: HouseDocument,
  floorId: string,
  areaId: string,
  centerMm: Vector2,
): Readonly<{ command: Command; carpetId: string }> => {
  const area = findArea(house, floorId, areaId);
  const carpet: CarpetValue = {
    id: createId("c"),
    name: nextFreeName(area?.floor.carpets.map((candidate) => candidate.name) ?? [], "Carpet"),
    positionMm: { x: centerMm.x, y: centerMm.y },
    rotationDeg: 0,
    material: {
      ...defaultFlooring(),
      pbrMetallicRoughness: {
        baseColorFactor: [0.45, 0.2, 0.18, 1],
        roughnessFactor: 0.95,
        metallicFactor: 0,
      },
    },
    shapes: [
      {
        id: createId("s"),
        type: "rectangle",
        positionMm: { x: 0, y: 0 },
        rotationDeg: 0,
        widthMm: 2000,
        heightMm: 1400,
      },
    ],
  };
  return {
    carpetId: carpet.id,
    command: defineCommand(`Add ${carpet.name}`, floorId, (draft) => {
      const target = draft.floors
        .find((floor) => floor.id === floorId)
        ?.areas.find((candidate) => candidate.id === areaId);
      if (target === undefined) return "The area no longer exists.";
      target.floor.carpets.push(carpet);
      return undefined;
    }),
  };
};

/**
 * Carpet stacking (Phase 7.3, closes a 7.0 audit gap): later carpets lie on top, so moving a carpet one step later
 * brings it forward and one step earlier sends it back. One undo step; nothing happens at either end.
 */
export const reorderCarpetCommand = (
  floorId: string,
  areaId: string,
  carpetId: string,
  direction: "forward" | "backward",
): Command =>
  defineCommand(
    direction === "forward" ? "Bring carpet forward" : "Send carpet backward",
    floorId,
    (draft) => {
      const carpets = draft.floors
        .find((floor) => floor.id === floorId)
        ?.areas.find((area) => area.id === areaId)?.floor.carpets;
      const index = carpets?.findIndex((carpet) => carpet.id === carpetId) ?? -1;
      if (carpets === undefined || index < 0) return "The carpet no longer exists.";
      const target = direction === "forward" ? index + 1 : index - 1;
      const moved = carpets[index];
      const other = carpets[target];
      if (moved === undefined || other === undefined) return undefined;
      carpets[target] = moved;
      carpets[index] = other;
      return undefined;
    },
  );

export const createLight = (name: string, positionMm: Vector2): LightValue => ({
  id: createId("l"),
  name,
  fixture: null,
  fixtureVisible: true,
  geometry: { type: "point", lengthMm: 1000, widthMm: 12 },
  positionMm: { x: positionMm.x, y: positionMm.y },
  elevationMm: 2300,
  rotationDeg: 0,
  spot: { tiltDeg: 0, beamAngleDeg: 40, softEdge: 0.3 },
  renderCapabilities: { colorModes: ["fixedWhite", "colorTemperature", "rgb"] },
  defaults: {
    enabled: true,
    brightness: 1,
    outputLumens: 800,
    color: { mode: "fixedWhite", kelvin: 3000, rgb: [255, 255, 255] },
  },
});

export const addLightCommand = (floorId: string, areaId: string, light: LightValue): Command =>
  defineCommand(`Add ${light.name}`, floorId, (draft) => {
    const target = draft.floors
      .find((floor) => floor.id === floorId)
      ?.areas.find((candidate) => candidate.id === areaId);
    if (target === undefined) return "The area no longer exists.";
    target.lights.push(light);
    return undefined;
  });

/** Placement fields a light handle changes (Phase 5.12). */
export type LightPatch = Readonly<{
  positionMm?: Vector2;
  elevationMm?: number;
  rotationDeg?: number;
  lengthMm?: number;
  tiltDeg?: number;
  /** A linear light's facing (Phase 13.3). */
  facingDeg?: number;
}>;

/**
 * Light handles (Phase 5.12): applies placement patches to one or more lights as one undo step (Raise and
 * Turn apply to every selected light together).
 */
export const updateLightsCommand = (
  floorId: string,
  updates: readonly Readonly<{ areaId: string; lightId: string; patch: LightPatch }>[],
  label: string,
): Command =>
  defineCommand(label, floorId, (draft) => {
    const floor = draft.floors.find((candidate) => candidate.id === floorId);
    for (const { areaId, lightId, patch } of updates) {
      const area = floor?.areas.find((candidate) => candidate.id === areaId);
      const light = area?.lights.find((candidate) => candidate.id === lightId);
      if (area === undefined || light === undefined) return "A light no longer exists.";
      if (patch.positionMm !== undefined) {
        light.positionMm = { ...patch.positionMm };
        // A wall-mounted light slides along its face (Phase 17.3).
        snapToWallMount(area, light, false);
      }
      if (patch.elevationMm !== undefined) light.elevationMm = patch.elevationMm;
      if (patch.rotationDeg !== undefined) light.rotationDeg = patch.rotationDeg;
      if (patch.lengthMm !== undefined) light.geometry.lengthMm = patch.lengthMm;
      if (patch.tiltDeg !== undefined) light.spot.tiltDeg = patch.tiltDeg;
      if (patch.facingDeg !== undefined) light.geometry.facingDeg = patch.facingDeg;
    }
    return undefined;
  });

/**
 * Choosing a light's fixture (the fixture picker): a template that mounts only on walls (`attachment.hosts` is
 * `["wall"]`, Phase 17.3: outdoor wall lights) also mounts a free light on the nearest wall of its area, on the
 * template's default side (else the side the light is on). One undo step.
 */
export const chooseFixtureCommand = (
  floorId: string,
  areaId: string,
  lightId: string,
  fixture: NonNullable<LightValue["fixture"]>,
  wallOnly: Readonly<{ side: "interior" | "exterior" | undefined }> | null,
): Command =>
  defineCommand("Choose fixture", floorId, (draft) => {
    const area = draft.floors
      .find((floor) => floor.id === floorId)
      ?.areas.find((candidate) => candidate.id === areaId);
    const light = area?.lights.find((candidate) => candidate.id === lightId);
    if (area === undefined || light === undefined) return "The light no longer exists.";
    light.fixture = { ...fixture };
    if (wallOnly !== null && light.mount !== "wall") mountOnNearestWall(area, light, wallOnly.side);
    return undefined;
  });

export const addLightGroupCommand = (
  house: HouseDocument,
  floorId: string,
  memberIds: readonly string[],
): Readonly<{ command: Command; groupId: string }> => {
  const floor = house.floors.find((candidate) => candidate.id === floorId);
  const group: LightGroupValue = {
    id: createId("g"),
    name: nextFreeName(floor?.lightGroups.map((candidate) => candidate.name) ?? [], "Group"),
    memberIds: [...memberIds],
  };
  return {
    groupId: group.id,
    command: defineCommand(`Add ${group.name}`, floorId, (draft) => {
      const target = draft.floors.find((candidate) => candidate.id === floorId);
      if (target === undefined) return "The floor no longer exists.";
      target.lightGroups.push(group);
      return undefined;
    }),
  };
};

export type GroupLightSettings = Readonly<{
  enabled?: boolean;
  brightness?: number;
  color?: LightValue["defaults"]["color"];
}>;

/** Bulk edit: writes the values into each member light's own defaults as one command (no override layer, D08). */
export const setGroupLightsCommand = (
  floorId: string,
  groupId: string,
  settings: GroupLightSettings,
): Command =>
  defineCommand("Edit light group", floorId, (draft) => {
    const floor = draft.floors.find((candidate) => candidate.id === floorId);
    const group = floor?.lightGroups.find((candidate) => candidate.id === groupId);
    if (floor === undefined || group === undefined) return "The group no longer exists.";
    const members = new Set(group.memberIds);
    for (const area of floor.areas) {
      for (const light of area.lights) {
        if (!members.has(light.id)) continue;
        if (settings.enabled !== undefined) light.defaults.enabled = settings.enabled;
        if (settings.brightness !== undefined) light.defaults.brightness = settings.brightness;
        if (settings.color !== undefined && light.renderCapabilities.colorModes.includes(settings.color.mode))
          light.defaults.color = structuredClone(settings.color);
      }
    }
    return undefined;
  });
