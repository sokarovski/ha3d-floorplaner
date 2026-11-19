// Save as preset (D19).
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
