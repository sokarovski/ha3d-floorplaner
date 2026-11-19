// Fixture schemas that select each generic editor on /ds/property-editors pages.
import Type from "typebox";
import { hp } from "@shared/domain/schemas/annotations";
import { Angle, Choice, ColorRgb, Length, Vector2Length } from "@shared/domain/schemas/values";
import { FileField } from "@shared/domain/schemas/forms/fileField";

export const editorFixtures = {
  text: Type.String({ title: "Name", minLength: 1, maxLength: 120, ...hp({ editor: "text" }) }),
  number: Type.Number({
    title: "Output",
    exclusiveMinimum: 0,
    maximum: 200000,
    ...hp({ editor: "number", quantity: "luminousFlux", unitSuffix: "lm" }),
  }),
  length: Length({ title: "Height", minimum: 1, maximum: 20000 }),
  angle: Angle({ title: "Rotation" }),
  select: Choice(
    [
      ["outside", "Outside"],
      ["inside", "Inside"],
      ["center", "Center"],
    ],
    { title: "Alignment", editor: "select" },
  ),
  segmented: Choice(
    [
      ["light", "Light"],
      ["dark", "Dark"],
      ["auto", "Auto"],
    ],
    { title: "Theme", icons: { light: "sun", dark: "moon", auto: "monitor" } },
  ),
  multiSelect: Type.Array(
    Choice([
      ["fixedWhite", "Fixed white"],
      ["colorTemperature", "Color temperature"],
      ["rgb", "RGB"],
    ]),
    { title: "Color modes", minItems: 1, uniqueItems: true, ...hp({ editor: "multiSelect" }) },
  ),
  toggle: Type.Boolean({ title: "Enabled", ...hp({ editor: "toggle" }) }),
  slider: Type.Number({
    title: "Brightness",
    minimum: 0,
    maximum: 1,
    ...hp({ editor: "slider", step: 0.01 }),
  }),
  color: ColorRgb({ title: "Color" }),
  vector2Length: Vector2Length({ title: "Position" }),
  dateTime: Type.String({ title: "Date and time", ...hp({ editor: "dateTime" }) }),
  file: FileField({
    title: "Image",
    accept: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 25 * 1024 * 1024,
  }),
  readOnly: Type.Number({
    title: "Length",
    readOnly: true,
    ...hp({ editor: "readOnly", quantity: "length", derived: true }),
  }),
} as const;
