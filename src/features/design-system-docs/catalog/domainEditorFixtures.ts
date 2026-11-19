// Schemas and values that select each domain editor on /ds pages.
import Type from "typebox";
import { hp } from "@shared/domain/schemas/annotations";
import { HouseLocation } from "@shared/domain/schemas/house";
import { SurfaceMaterial, TemplateRef } from "@shared/domain/schemas/values";
import { defaultWallPaint } from "@shared/domain/house/defaults";
import { templateMaterialChoiceSchemas } from "@shared/domain/templates/materialChoices";
import { fixtureCabinetMetadata, fixtureCabinetSwatches } from "./templateSettingsFixtures";

/** The doors slot of the fixture cabinet: presets Oak (the slot's own), Wenge, White; own colour and texture. */
const fixtureDoorsChoice =
  templateMaterialChoiceSchemas(fixtureCabinetMetadata, fixtureCabinetSwatches).doors ?? {};

export const domainEditorFixtures = {
  material: SurfaceMaterial({ title: "Interior" }),
  image: Type.String({ title: "Texture", ...hp({ editor: "image" }) }),
  location: HouseLocation,
  reference: Type.String({ title: "Wall", ...hp({ editor: "reference", referenceKind: "wall" }) }),
  referenceMultiple: Type.Array(Type.String(), {
    title: "Members",
    ...hp({ editor: "reference", referenceKind: "light", multiple: true }),
  }),
  templateVersion: Type.Integer({ title: "Template", ...hp({ editor: "templateVersion" }) }),
  fixture: Type.Union([TemplateRef, Type.Null()], { title: "Fixture", ...hp({ editor: "templateVersion" }) }),
  materialChoice: fixtureDoorsChoice,
  lampPower: Type.Number({
    title: "Lamp power",
    exclusiveMinimum: 0,
    ...hp({ editor: "lampPower", unitSuffix: "W" }),
  }),
} as const;

export const fixtureMaterial = defaultWallPaint();
