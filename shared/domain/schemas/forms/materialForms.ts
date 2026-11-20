// Save as preset (D19) and New material from image.
import Type from "typebox";
import type { Static } from "typebox";
import { hp } from "../annotations";
import { Length } from "../values";
import { FileField } from "./fileField";
import { imageMediaTypes, maxImageBytes } from "./imageForms";

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
 * New material from image (owner, 2026-11-20; the material chooser): an uploaded image becomes a textured house
 * preset, with the image's proposed material values (the real width of one repeat, the height following the image's
 * proportions; Shininess; metallic) stored with the image, so choosing it again in any material proposes them.
 */
export const newMaterialFromImageForm = Type.Object(
  {
    file: FileField({ title: "Image", accept: imageMediaTypes, maxBytes: maxImageBytes, order: 1 }),
    name: Type.String({
      title: "Material name",
      minLength: 1,
      maxLength: 120,
      ...hp({ editor: "text", placeholder: "Kitchen tiles", order: 2 }),
    }),
    repeatWidthMm: Length({
      title: "Width of one repeat",
      minimum: 10,
      maximum: 100000,
      default: 1000,
      description: "The real size the image covers once (the height follows the image's proportions).",
      order: 3,
    }),
    roughness: Type.Number({
      title: "Shininess",
      minimum: 0,
      maximum: 1,
      default: 0.7,
      ...hp({ editor: "slider", inverted: true, step: 0.01, order: 4 }),
    }),
    metallic: Type.Number({
      title: "Metallic",
      minimum: 0,
      maximum: 1,
      default: 0,
      ...hp({ editor: "slider", step: 0.01, order: 5 }),
    }),
  },
  {
    $id: "urn:homeplan:form:new-material-from-image:1",
    additionalProperties: false,
    required: ["file", "name", "repeatWidthMm", "roughness", "metallic"],
    ...hp({
      title: "New material from image",
      submitLabel: "Create material",
      description:
        "JPEG, PNG, or WebP, up to 25 MB. The image repeats across the surface; it is saved as a house preset and applied.",
    }),
  },
);
export type NewMaterialFromImageForm = Static<typeof newMaterialFromImageForm>;
