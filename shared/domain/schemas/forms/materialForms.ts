// Save as preset (D19) and Create material.
import Type from "typebox";
import type { Static } from "typebox";
import { hp } from "../annotations";

export const savePresetForm = Type.Object(
  {
    name: Type.String({
      title: "Preset name",
      minLength: 1,
      maxLength: 120,
      ...hp({ editor: "text", placeholder: "Oak parquet", order: 1 }),
    }),
  },
  {
    $id: "urn:homeplan:form:save-preset:1",
    additionalProperties: false,
    ...hp({ title: "Save as preset", submitLabel: "Save preset", size: "sm" }),
  },
);
export type SavePresetForm = Static<typeof savePresetForm>;

/**
 * Create material (owner, 2026-11-20; the material chooser): a name only. The new house preset is plain white
 * without a texture, selected in the chooser's editor, where its texture and values are set.
 */
export const createMaterialForm = Type.Object(
  {
    name: Type.String({
      title: "Material name",
      minLength: 1,
      maxLength: 120,
      ...hp({ editor: "text", placeholder: "Kitchen tiles", order: 1 }),
    }),
  },
  {
    $id: "urn:homeplan:form:create-material:1",
    additionalProperties: false,
    required: ["name"],
    ...hp({
      title: "Create material",
      submitLabel: "Create",
      size: "sm",
      description: "A plain white material in House presets; choose its texture and adjust it in the editor.",
    }),
  },
);
export type CreateMaterialForm = Static<typeof createMaterialForm>;
