// New house and Rename house forms (spec/design-system/README.md#mvp-forms).
import Type from "typebox";
import type { Static } from "typebox";
import { hp } from "../annotations";
import { FileField } from "./fileField";

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

/** The largest house archive accepted (as the builder's snapshot export limit). */
export const maxHouseArchiveBytes = 1024 * 1024 * 1024;

/** Upload house (Phase 21): a house archive (.zip) becomes a new house. */
export const uploadHouseForm = Type.Object(
  {
    file: FileField({
      title: "House archive",
      accept: [".zip", "application/zip", "application/x-zip-compressed"],
      maxBytes: maxHouseArchiveBytes,
      order: 1,
    }),
  },
  {
    $id: "urn:homeplan:form:upload-house:1",
    additionalProperties: false,
    required: ["file"],
    ...hp({
      title: "Upload house",
      submitLabel: "Upload",
      size: "sm",
      description:
        "A house archive (.zip), downloaded from Home Assistant (Settings → Houses), becomes a new house here.",
    }),
  },
);
export type UploadHouseForm = Static<typeof uploadHouseForm>;

/** Name the uploaded house (Phase 21): asked when the archive's house name is already in use. */
export const nameUploadedHouseForm = Type.Object(
  { name: HouseName },
  {
    $id: "urn:homeplan:form:name-uploaded-house:1",
    additionalProperties: false,
    required: ["name"],
    ...hp({
      title: "Name the uploaded house",
      submitLabel: "Upload",
      size: "sm",
      description:
        "A house with this name already exists. Keep the suggested name with its number, or type a new one.",
    }),
  },
);
export type NameUploadedHouseForm = Static<typeof nameUploadedHouseForm>;
