import type { ReactElement } from "react";
import { genericEditors } from "../../../design-system/property-editors/genericEditors";
import { editorFixtures } from "../catalog/editorFixtures";
import { EditorStates } from "../components/EditorStates";

export const SelectEditorExample = (): ReactElement => (
  <EditorStates
    editor="select"
    registry={genericEditors}
    schema={editorFixtures.select}
    validValue={"outside"}
    invalidMessage="Choose a value."
  />
);
