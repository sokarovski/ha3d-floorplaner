// Measurement guide, persisted per floor in floor coordinates (D16).
// A line guide passes through aMm and bMm; a point guide marks bMm.
import Type from "typebox";
import type { Static } from "typebox";
import { hp } from "./annotations";
import { propertyGroups } from "./propertyGroups";
import { Choice, Id, Vector2Length } from "./values";

export const Guide = Type.Object(
  {
    id: Id,
    kind: Choice(
      [
        ["line", "Guide line"],
        ["point", "Guide point"],
      ],
      { title: "Kind", readOnly: true, group: "general", order: 1 },
    ),
    visible: Type.Boolean({
      title: "Visible",
      default: true,
      ...hp({ editor: "toggle", group: "general", order: 2 }),
    }),
    aMm: Vector2Length({ hidden: true }),
    bMm: Vector2Length({ hidden: true }),
  },
  { additionalProperties: false, title: "Guide", ...hp({ groups: propertyGroups("general").groups }) },
);

export type GuideValue = Static<typeof Guide>;
