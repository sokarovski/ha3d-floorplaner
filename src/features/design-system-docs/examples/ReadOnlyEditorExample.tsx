import type { ReactElement } from "react";
import { genericEditors } from "../../../design-system/property-editors/genericEditors";
import { editorFixtures } from "../catalog/editorFixtures";
import { EditorStates } from "../components/EditorStates";

export const ReadOnlyEditorExample = (): ReactElement => (
  <EditorStates
    editor="readOnly"
    registry={genericEditors}
    schema={editorFixtures.readOnly}
    validValue={4525}
    invalidMessage="Needs repair: the source edge is no longer on the boundary."
  />
);
