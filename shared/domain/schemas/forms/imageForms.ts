// Upload image and Rename image forms (spec/builder/features/house-images.md).
import Type from "typebox";
import type { Static } from "typebox";
import { hp } from "../annotations";
import { FileField } from "./fileField";

export const imageMediaTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const maxImageBytes = 25 * 1024 * 1024;

export const uploadImageForm = Type.Object(
  {
    file: FileField({ title: "Image", accept: imageMediaTypes, maxBytes: maxImageBytes, order: 1 }),
    name: Type.Optional(
      Type.String({
        title: "Name",
        maxLength: 120,
        ...hp({ editor: "text", placeholder: "From the file name", order: 2 }),
      }),
    ),
  },
  {
    $id: "urn:homeplan:form:upload-image:1",
    additionalProperties: false,
    ...hp({
      title: "Upload image",
      submitLabel: "Upload",
      description: "JPEG, PNG, or WebP, up to 25 MB and 8192 px on the longest side.",
    }),
  },
);
export type UploadImageForm = Static<typeof uploadImageForm>;

export const renameImageForm = Type.Object(
  { name: Type.String({ title: "Name", minLength: 1, maxLength: 120, ...hp({ editor: "text", order: 1 }) }) },
  {
    $id: "urn:homeplan:form:rename-image:1",
    additionalProperties: false,
    ...hp({ title: "Rename image", submitLabel: "Rename", size: "sm" }),
  },
);
export type RenameImageForm = Static<typeof renameImageForm>;
