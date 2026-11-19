// The bindable things of the shown floor (D25, spec/home-assistant/bindings.md#editor): lights, objects (with
// their ambient effects), doors and windows (objects too, for their state parameters, 9.7), and rooms, as the
// binding editor lists them.
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import { effectKindLabel } from "@shared/domain/schemas/effects";
import type { HaBindingKind } from "@shared/domain/schemas/homeAssistant";
import { houseLightOutput } from "./lightOutput";
import type { HouseLightOutput } from "./lightOutput";

/** Things tapped in Edit mode or listed in the editor; effects are edited under their object. */
export type TargetKind = Exclude<HaBindingKind, "effects">;

/** An object's ambient effect; `color` is its authored colour, where a variant's custom colour starts. */
export type EffectTarget = Readonly<{ id: string; name: string; color: readonly number[] }>;

export type BindingTarget = Readonly<{
  kind: TargetKind;
  id: string;
  name: string;
  /** The room it is in (a room: itself). */
  areaId: string;
  /** The room it is in (empty for a room). */
  areaName: string;
  effects: readonly EffectTarget[];
  /** A door or window on a wall (an `objects` binding; its gestures default by its states, 10.1). */
  opening?: true;
  /** A light's own output in the house, what its HA lumens and temperature overrides replace (13.6). */
  light?: HouseLightOutput;
}>;

export const kindLabels: Readonly<Record<TargetKind, string>> = {
  lights: "Light",
  objects: "Object",
  areas: "Room",
};

export const bindingTargets = (floor: BuildingFloorValue): readonly BindingTarget[] =>
  floor.areas.flatMap((area): BindingTarget[] => [
    { kind: "areas", id: area.id, name: area.name, areaId: area.id, areaName: "", effects: [] },
    ...area.lights.map((light): BindingTarget => ({
      kind: "lights",
      id: light.id,
      name: light.name,
      areaId: area.id,
      areaName: area.name,
      effects: [],
      light: houseLightOutput(light),
    })),
    ...area.objects.map((object): BindingTarget => ({
      kind: "objects",
      id: object.id,
      name: object.name,
      areaId: area.id,
      areaName: area.name,
      effects: (object.effects ?? []).map((effect, index, all) => ({
        id: effect.id,
        color: effect.color,
        name:
          all.filter((other) => other.kind === effect.kind).length > 1
            ? `${effectKindLabel(effect.kind)} ${String(index + 1)}`
            : effectKindLabel(effect.kind),
      })),
    })),
    ...area.walls.flatMap((wall) =>
      wall.objects.map((opening): BindingTarget => ({
        kind: "objects",
        id: opening.id,
        name: opening.name,
        areaId: area.id,
        areaName: area.name,
        effects: [],
        opening: true,
      })),
    ),
  ]);
