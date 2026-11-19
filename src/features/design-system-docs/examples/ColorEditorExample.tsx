import type { ReactElement } from "react";
import { genericEditors } from "../../../design-system/property-editors/genericEditors";
import { editorFixtures } from "../catalog/editorFixtures";
import { EditorStates } from "../components/EditorStates";

export const ColorEditorExample = (): ReactElement => (
  <EditorStates
    editor="color"
    registry={genericEditors}
    schema={editorFixtures.color}
    validValue={[255, 200, 120]}
    invalidMessage="Enter a hex color such as #ffcc88."
  />
);
