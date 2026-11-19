// Domain editors registered with the application editor registry (D18).
import type { PropertyEditorRegistry } from "../../../design-system/property-editors/editorContract";
import { ImagePropEditor } from "./ImagePropEditor";
import { LampPowerPropEditor } from "./LampPowerPropEditor";
import { LocationPropEditor } from "./LocationPropEditor";
import { ReferencePropEditor } from "./ReferencePropEditor";
import { TemplateVersionPropEditor } from "./TemplateVersionPropEditor";
import { MaterialChoicePropEditor } from "./MaterialChoicePropEditor";
import { MaterialPropEditor } from "./MaterialPropEditor";

export const domainEditors: PropertyEditorRegistry = {
  material: MaterialPropEditor,
  materialChoice: MaterialChoicePropEditor,
  image: ImagePropEditor,
  location: LocationPropEditor,
  reference: ReferencePropEditor,
  templateVersion: TemplateVersionPropEditor,
  lampPower: LampPowerPropEditor,
};
