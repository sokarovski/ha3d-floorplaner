// Editor registry for the Object Editor: the application registry plus the nodeRef domain editor.
import type { PropertyEditorRegistry } from "../../../design-system/property-editors/editorContract";
import { applicationRegistry } from "../../floor-builder/services/editorRegistry";
import { NodeRefPropEditor } from "../components/NodeRefPropEditor";

export const objectEditorRegistry = (): PropertyEditorRegistry => ({
  ...applicationRegistry(),
  nodeRef: NodeRefPropEditor,
});
