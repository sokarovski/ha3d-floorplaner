// Ambient effects on objects (D24): adding one. Editing goes through setPropertyCommand on the effect entity,
// deleting through deleteEntitiesCommand, like every other list-held entity.
import { createId } from "../ids";
import { indexEntities } from "../house/entityIndex";
import type { AmbientEffectValue } from "../schemas/effects";
import { effectKindLabel, heatingRgb } from "../schemas/effects";
import type { HouseDocument } from "../schemas/house";
import { defineCommand } from "./command";
import type { Command } from "./command";

/** At most this many effects on one object (the schema's `maxItems`). */
export const maxEffectsPerObject = 8;

/** A new effect: a red swirl rising from the middle of the object's top. */
export const newAmbientEffect = (): AmbientEffectValue => ({
  id: createId("fx"),
  kind: "swirl",
  enabled: true,
  direction: "up",
  offsetMm: { x: 0, y: 0, h: 100 },
  color: [...heatingRgb],
  sizeMm: 600,
});

export const addEffectCommand = (
  house: HouseDocument,
  objectId: string,
  effect: AmbientEffectValue,
): Command => {
  const ref = indexEntities(house).get(objectId);
  const floorId = ref === undefined || ref.kind === "house" ? undefined : ref.floorId;
  return defineCommand(`Add ${effectKindLabel(effect.kind).toLowerCase()}`, floorId, (draft) => {
    if (ref?.kind !== "object") return "Effects can only be added to an object.";
    const object = draft.floors
      .find((floor) => floor.id === ref.floorId)
      ?.areas.find((area) => area.id === ref.areaId)
      ?.objects.find((candidate) => candidate.id === objectId);
    if (object === undefined) return "The object no longer exists.";
    const effects = object.effects ?? [];
    if (effects.length >= maxEffectsPerObject)
      return `An object has at most ${String(maxEffectsPerObject)} effects.`;
    object.effects = [...effects, effect];
    return undefined;
  });
};
