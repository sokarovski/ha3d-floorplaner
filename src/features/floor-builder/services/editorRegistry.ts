// The application editor registry: the design system's generic editors plus feature domain editors.
import type { PropertyEditorRegistry } from "../../../design-system/property-editors/editorContract";
import { genericEditors } from "../../../design-system/property-editors/genericEditors";
import { domainEditors } from "../domain-editors/domainEditors";

export const applicationRegistry = (): PropertyEditorRegistry => ({ ...genericEditors, ...domainEditors });
