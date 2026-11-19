// New house and Rename house forms (spec/design-system/README.md#mvp-forms).
import Type from "typebox";
import type { Static } from "typebox";
import { hp } from "../annotations";

const HouseName = Type.String({
  title: "Name",
  minLength: 1,
  maxLength: 120,
  ...hp({ editor: "text", placeholder: "My home", order: 1 }),
});

export const newHouseForm = Type.Object(
  { name: HouseName },
  {
    $id: "urn:homeplan:form:new-house:1",
    additionalProperties: false,
    required: ["name"],
    ...hp({ title: "New house", submitLabel: "Create", size: "sm" }),
  },
);
export type NewHouseForm = Static<typeof newHouseForm>;

export const renameHouseForm = Type.Object(
  { name: HouseName },
  {
    $id: "urn:homeplan:form:rename-house:1",
    additionalProperties: false,
    ...hp({ title: "Rename house", submitLabel: "Rename", size: "sm" }),
  },
);
export type RenameHouseForm = Static<typeof renameHouseForm>;
