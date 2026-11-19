// A template's settings panel on /ds (Phase 9.1): a real TemplateMetadata whose parameters and material choices
// go through the same functions as in the Floor Builder (templateParameterSchema, templateMaterialChoiceSchemas,
// withTemplateParameters), so the page shows exactly what a placed object shows.
import { AreableInstance } from "@shared/domain/schemas/instances";
import type { AreableInstanceValue } from "@shared/domain/schemas/instances";
import { isSchemaNode } from "@shared/domain/schemas/schemaWalk";
import type { SchemaNode } from "@shared/domain/schemas/schemaWalk";
import { withTemplateParameters } from "@shared/domain/templates/instanceSchema";
import { templateMaterialChoiceSchemas } from "@shared/domain/templates/materialChoices";
import type { MaterialSwatch } from "@shared/domain/templates/materialChoices";
import { defaultInstanceParameters, templateParameterSchema } from "@shared/domain/templates/metadata";
import type { TemplateMetadata } from "@shared/domain/templates/metadata";

export const fixtureCabinetMetadata: TemplateMetadata = {
  schemaVersion: 1,
  kind: "cabinet",
  label: "Wall cabinet",
  contract: "Areable",
  attachment: { hosts: ["wall", "floor"], contact: "back" },
  resize: {
    x: {
      mode: "slice",
      startMm: 20,
      endMm: 20,
      minMm: 300,
      maxMm: 1200,
      defaultMm: 600,
      description: "Carcass width; the doors share it.",
      quickPicks: [400, 500, 600, 800],
    },
    y: { mode: "slice", startMm: 20, endMm: 20, minMm: 300, maxMm: 1000, defaultMm: 720 },
    z: { mode: "fixed" },
  },
  flip: { x: true, z: false },
  opening: null,
  category: "Kitchen",
  materialSlots: {
    carcass: "Carcass",
    doors: {
      material: "Oak",
      title: "Doors",
      choosable: true,
      presets: ["Oak", "Wenge", "White"],
      allowColor: true,
      allowTexture: true,
    },
  },
  properties: {
    shelfCount: {
      type: "integer",
      title: "Shelves",
      description: "Inner shelves, spaced evenly.",
      minimum: 0,
      maximum: 4,
      default: 1,
      "x-homeplan": { quickPicks: [0, 1, 2] },
    },
    handles: {
      type: "boolean",
      title: "Handles",
      description: "Off for push-to-open doors.",
      default: true,
    },
    handleStyle: {
      type: "string",
      title: "Handle",
      anyOf: [
        { const: "bar", title: "Bar" },
        { const: "knob", title: "Knob" },
        { const: "edge", title: "Edge pull" },
      ],
      default: "bar",
    },
    hinge: { type: "string", title: "Hinge", enum: ["left", "right"], default: "left" },
    openAngleDeg: {
      type: "number",
      title: "Door open",
      description: "Live state; Home Assistant can drive it.",
      minimum: 0,
      maximum: 110,
      default: 0,
      "x-homeplan": { editor: "angle", quantity: "angle", state: true, quickPicks: [0, 90] },
    },
  },
};

export const fixtureCabinetSwatches: Readonly<Record<string, MaterialSwatch>> = {
  Carcass: { color: [235, 233, 228], textured: false },
  Oak: { color: [196, 154, 108], textured: true },
  Wenge: { color: [72, 52, 40], textured: false },
  White: { color: [246, 246, 244], textured: false },
};

const parameters = templateParameterSchema(fixtureCabinetMetadata);
const base: SchemaNode = isSchemaNode(AreableInstance) ? AreableInstance : {};

export const fixtureCabinetSchema = withTemplateParameters(base, {
  parameterProperties: parameters.properties,
  required: parameters.required,
  groups: parameters.groups,
  materialChoices: templateMaterialChoiceSchemas(fixtureCabinetMetadata, fixtureCabinetSwatches),
});

export const fixtureCabinet: AreableInstanceValue = {
  id: "o_fixture001",
  name: "Wall cabinet 1",
  templateId: "t_fixturecab",
  templateVersion: 1,
  parameters: defaultInstanceParameters(fixtureCabinetMetadata),
  flip: { x: false, z: false },
  materialOverrides: { doors: { preset: "Wenge" } },
  attachment: { host: "floor" },
  positionMm: { x: 1200, y: 600 },
  elevationMm: 0,
  rotationDeg: 0,
};
