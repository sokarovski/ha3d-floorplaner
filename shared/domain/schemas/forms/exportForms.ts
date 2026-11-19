// Export PNG (spec/delivery/rendering-and-exports.md, D16 presets).
import Type from "typebox";
import type { Static } from "typebox";
import { hp } from "../annotations";
import { Choice } from "../values";

export const exportPngForm = Type.Object(
  {
    scale: Choice(
      [
        ["1", "1× viewport"],
        ["2", "2× viewport"],
        ["4", "4× viewport"],
      ],
      { title: "Size", default: "2", order: 1 },
    ),
    transparentBackground: Type.Boolean({
      title: "Transparent background",
      default: false,
      ...hp({ editor: "toggle", order: 2 }),
    }),
    saveToProject: Type.Boolean({
      title: "Save to project",
      default: true,
      ...hp({ editor: "toggle", order: 3 }),
    }),
  },
  {
    $id: "urn:homeplan:form:export-png:1",
    additionalProperties: false,
    required: ["scale", "transparentBackground", "saveToProject"],
    ...hp({ title: "Export PNG", submitLabel: "Export" }),
  },
);
export type ExportPngForm = Static<typeof exportPngForm>;
