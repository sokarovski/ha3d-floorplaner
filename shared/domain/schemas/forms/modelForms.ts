// Import model (Phase 2, spec/builder/screens/object-editor.md).
import Type from "typebox";
import type { Static } from "typebox";
import { hp } from "../annotations";
import { Choice } from "../values";
import { FileField } from "./fileField";

export const maxModelBytes = 100 * 1024 * 1024;

const axisChoices = [
  ["+y", "+Y"],
  ["-y", "−Y"],
  ["+z", "+Z"],
  ["-z", "−Z"],
  ["+x", "+X"],
  ["-x", "−X"],
] as const;

export const importModelForm = Type.Object(
  {
    file: FileField({
      title: "Model file",
      accept: [".glb", ".gltf", ".stl"],
      maxBytes: maxModelBytes,
      order: 1,
    }),
    format: Choice(
      [
        ["gltf", "GLB / glTF"],
        ["stl", "STL"],
      ],
      { title: "Format", default: "gltf", order: 2 },
    ),
    unit: Choice(
      [
        ["mm", "Millimeters"],
        ["cm", "Centimeters"],
        ["m", "Meters"],
        ["in", "Inches"],
        ["ft", "Feet"],
      ],
      { title: "Source unit", default: "mm", order: 3, visibleWhen: { property: "format", equals: "stl" } },
    ),
    upAxis: Choice(axisChoices, {
      title: "Up axis",
      default: "+z",
      order: 4,
      visibleWhen: { property: "format", equals: "stl" },
    }),
    frontAxis: Choice(axisChoices, {
      title: "Front axis",
      default: "-y",
      order: 5,
      visibleWhen: { property: "format", equals: "stl" },
    }),
  },
  {
    $id: "urn:homeplan:form:import-model:1",
    additionalProperties: false,
    required: ["file", "format"],
    ...hp({
      title: "Import model",
      submitLabel: "Import",
      description: "GLB/glTF or STL, up to 100 MB. STL has no units or axes, so confirm them.",
    }),
  },
);
export type ImportModelForm = Static<typeof importModelForm>;
