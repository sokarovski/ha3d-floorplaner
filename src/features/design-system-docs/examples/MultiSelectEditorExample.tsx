import type { ReactElement } from "react";
import { genericEditors } from "../../../design-system/property-editors/genericEditors";
import { editorFixtures } from "../catalog/editorFixtures";
import { EditorStates } from "../components/EditorStates";

export const MultiSelectEditorExample = (): ReactElement => (
  <EditorStates
    editor="multiSelect"
    registry={genericEditors}
    schema={editorFixtures.multiSelect}
    validValue={["fixedWhite", "rgb"]}
    invalidMessage="Choose at least one mode."
  />
);
