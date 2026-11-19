// Ambient effects on objects (D24, spec/builder/features/ambient-effects.md): small stop-motion animations
// (a swirl, rising vapour) attached to an Areable object, placed in the object's own frame. An effect is its
// own entity (kind `effect` in the entity index, a child row of its object), edited through its schema (D18).
import Type from "typebox";
import type { Static } from "typebox";
import { hp } from "./annotations";
import { propertyGroups } from "./propertyGroups";
import { Choice, ColorRgb, Id, Length } from "./values";

export const effectKinds = ["swirl", "vapour"] as const;
export type EffectKind = (typeof effectKinds)[number];

/** Red for heating (water heater, boiler); the default of a new effect. */
export const heatingRgb: readonly [number, number, number] = [226, 72, 52];
/** Blue for cooling (air conditioner). */
export const coolingRgb: readonly [number, number, number] = [56, 140, 236];
/** Near white for vapour (dryer, kettle). */
export const vapourRgb: readonly [number, number, number] = [236, 240, 244];

/** Every field but the ID: shared by the instance effect and a template's default effects (D17 `extras`). */
const effectFields = {
  kind: Choice(
    [
      ["swirl", "Swirl"],
      ["vapour", "Vapour"],
    ],
    { title: "Kind", default: "swirl", group: "general", order: 1 },
  ),
  enabled: Type.Boolean({
    title: "Enabled",
    default: true,
    description: "Off never plays; in the Home Assistant viewer a binding decides when it runs",
    ...hp({ editor: "toggle", group: "general", order: 2 }),
  }),
  direction: Choice(
    [
      ["up", "Up"],
      ["forward", "Forward"],
    ],
    { title: "Direction", default: "up", group: "placement", order: 1 },
  ),
  offsetMm: Type.Object(
    {
      x: Length({ title: "Right", inlineLabel: "R", minimum: -5000, maximum: 5000, order: 1 }),
      y: Length({ title: "Forward", inlineLabel: "F", minimum: -5000, maximum: 5000, order: 2 }),
      h: Length({ title: "Up", inlineLabel: "U", minimum: -5000, maximum: 5000, order: 3 }),
    },
    {
      additionalProperties: false,
      title: "Offset",
      description: "From the middle of the object's top (Up) or front (Forward), in the object's own axes",
      ...hp({ group: "placement", order: 2 }),
    },
  ),
  color: ColorRgb({ title: "Colour", group: "appearance", order: 1 }),
  sizeMm: Length({ title: "Size", minimum: 100, maximum: 3000, default: 600, group: "appearance", order: 2 }),
};

export const AmbientEffect = Type.Object(
  { id: Id, ...effectFields },
  {
    additionalProperties: false,
    title: "Effect",
    ...hp({ groups: propertyGroups("general", "placement", "appearance").groups }),
  },
);

/** A template's default effect (`extras.homeplan.effects`); placing the template copies it with a new ID. */
export const TemplateEffect = Type.Object(effectFields, { additionalProperties: false });

export type AmbientEffectValue = Static<typeof AmbientEffect>;
export type TemplateEffectValue = Static<typeof TemplateEffect>;

export const effectKindLabel = (kind: EffectKind): string => (kind === "swirl" ? "Swirl" : "Vapour");
