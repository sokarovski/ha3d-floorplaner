// Placing template instances (D07: pin template ID + version; default placement applies only on insertion).
import { createId } from "../ids";
import type { AmbientEffectValue, TemplateEffectValue } from "../schemas/effects";
import type { AreableInstanceValue, WallableInstanceValue } from "../schemas/instances";
import type { AttachmentHost, TemplateMetadata } from "../templates/metadata";
import { defaultInstanceParameters } from "../templates/metadata";
import type { Vector2 } from "../schemas/values";
import { defineCommand } from "./command";
import type { Command } from "./command";

export type TemplateChoice = Readonly<{
  templateId: string;
  version: number;
  label: string;
  metadata: TemplateMetadata;
}>;

export const newWallableInstance = (
  choice: TemplateChoice,
  name: string,
  distanceAlongWallMm: number,
): WallableInstanceValue => ({
  id: createId("o"),
  name,
  templateId: choice.templateId,
  templateVersion: choice.version,
  placement: { distanceAlongWallMm, bottomMm: choice.metadata.attachment.defaultPlacement?.bottomMm ?? 0 },
  parameters: defaultInstanceParameters(choice.metadata),
  flip: { x: false, z: false },
  materialOverrides: {},
});

/** A template's default effects (D24) as instance effects with fresh IDs. */
export const effectsFromTemplate = (defaults: readonly TemplateEffectValue[]): AmbientEffectValue[] =>
  defaults.map((effect) => ({
    ...effect,
    id: createId("fx"),
    offsetMm: { ...effect.offsetMm },
    color: [...effect.color],
  }));

/**
 * The host a new Areable instance attaches to (Phase 9.1): the first host the template lists that is available,
 * so `hosts: ["wall", "floor"]` mounts on a wall when there is one and otherwise stands on the floor, and
 * `["floor", "wall"]` stands on the floor. A wall is available when the caller has one; the legacy `staircaseArea`
 * host is read as the floor (Phase 16.14). A wall-only template without a wall still reports "wall" (the caller refuses it).
 */
export const defaultAreableHost = (
  hosts: readonly AttachmentHost[],
  wallAvailable: boolean,
): "wall" | "floor" | "overhead" =>
  hosts.find(
    (host): host is "wall" | "floor" | "overhead" =>
      host === "floor" || host === "overhead" || (host === "wall" && wallAvailable),
  ) ?? (hosts.includes("staircaseArea") ? "floor" : "wall");

/**
 * The floor-cut fields of a new instance (Phase 16.14, spec/builder/features/staircase-areas.md): a Staircasable
 * is a stair (Cut floor above on, Cut floor below off); a template with `floorCut` is a floor opening.
 */
const floorCutFields = (
  metadata: TemplateMetadata,
): Pick<AreableInstanceValue, "floorCut" | "floorCutShape" | "cutFloorAbove" | "cutFloorBelow"> =>
  metadata.contract === "Staircasable"
    ? { floorCut: "stair", cutFloorAbove: true, cutFloorBelow: false }
    : metadata.floorCut === undefined
      ? {}
      : {
          floorCut: "opening",
          ...(metadata.floorCut.shape === "ellipse" ? { floorCutShape: "ellipse" as const } : {}),
        };

export const newAreableInstance = (
  choice: TemplateChoice,
  name: string,
  positionMm: Vector2,
  wallId: string | undefined,
): AreableInstanceValue => {
  const hosts = choice.metadata.attachment.hosts;
  // A given wall is where the caller mounts it; otherwise the first listed floor or overhead host.
  const host = wallId !== undefined && hosts.includes("wall") ? "wall" : defaultAreableHost(hosts, false);
  return {
    id: createId("o"),
    name,
    templateId: choice.templateId,
    templateVersion: choice.version,
    parameters: defaultInstanceParameters(choice.metadata),
    flip: { x: false, z: false },
    materialOverrides: {},
    attachment: {
      host,
      ...(host === "wall" && wallId !== undefined
        ? { wallId, hostSide: choice.metadata.attachment.defaultHostSide ?? "interior" }
        : {}),
    },
    positionMm: { x: positionMm.x, y: positionMm.y },
    elevationMm:
      choice.metadata.attachment.defaultPlacement?.elevationMm ??
      (host === "overhead" ? 0 : host === "wall" ? 1200 : 0),
    rotationDeg: 0,
    ...floorCutFields(choice.metadata),
    ...(choice.metadata.effects === undefined || choice.metadata.effects.length === 0
      ? {}
      : { effects: effectsFromTemplate(choice.metadata.effects) }),
  };
};

export const addOpeningCommand = (
  floorId: string,
  areaId: string,
  wallId: string,
  instance: WallableInstanceValue,
): Command =>
  defineCommand(`Add ${instance.name}`, floorId, (draft) => {
    const wall = draft.floors
      .find((floor) => floor.id === floorId)
      ?.areas.find((area) => area.id === areaId)
      ?.walls.find((candidate) => candidate.id === wallId);
    if (wall === undefined) return "The wall no longer exists.";
    wall.objects.push(instance);
    return undefined;
  });

export const addObjectCommand = (floorId: string, areaId: string, instance: AreableInstanceValue): Command =>
  defineCommand(`Add ${instance.name}`, floorId, (draft) => {
    const area = draft.floors
      .find((floor) => floor.id === floorId)
      ?.areas.find((candidate) => candidate.id === areaId);
    if (area === undefined) return "The area no longer exists.";
    area.objects.push(instance);
    return undefined;
  });

/** "Update to vN" (D07): one command per instance or for all instances of the template. Parameters kept. */
export const updateTemplateVersionCommand = (
  floorId: string | undefined,
  instanceIds: ReadonlySet<string>,
  version: number,
): Command =>
  defineCommand(`Update template to v${String(version)}`, floorId, (draft) => {
    for (const floor of draft.floors) {
      for (const area of floor.areas) {
        for (const wall of area.walls)
          for (const opening of wall.objects)
            if (instanceIds.has(opening.id)) opening.templateVersion = version;
        for (const object of area.objects) if (instanceIds.has(object.id)) object.templateVersion = version;
        for (const light of area.lights)
          if (instanceIds.has(light.id) && light.fixture !== null) light.fixture.templateVersion = version;
      }
    }
    return undefined;
  });
