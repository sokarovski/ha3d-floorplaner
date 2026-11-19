import type { ReactElement } from "react";
import { genericEditors } from "../../../design-system/property-editors/genericEditors";
import { editorFixtures } from "../catalog/editorFixtures";
import { EditorStates } from "../components/EditorStates";

export const NumberEditorExample = (): ReactElement => (
  <EditorStates
    editor="number"
    registry={genericEditors}
    schema={editorFixtures.number}
    validValue={800}
    invalidMessage="Must be more than 0 lm."
  />
);
