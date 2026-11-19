import type { ReactElement } from "react";
import { genericEditors } from "../../../design-system/property-editors/genericEditors";
import { editorFixtures } from "../catalog/editorFixtures";
import { EditorStates } from "../components/EditorStates";

export const LengthEditorExample = (): ReactElement => (
  <EditorStates
    editor="length"
    registry={genericEditors}
    schema={editorFixtures.length}
    validValue={2500}
    invalidMessage="Must be at least 1 mm."
  />
);
