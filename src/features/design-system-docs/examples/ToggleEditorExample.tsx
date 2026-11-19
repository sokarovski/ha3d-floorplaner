import type { ReactElement } from "react";
import { genericEditors } from "../../../design-system/property-editors/genericEditors";
import { editorFixtures } from "../catalog/editorFixtures";
import { EditorStates } from "../components/EditorStates";

export const ToggleEditorExample = (): ReactElement => (
  <EditorStates
    editor="toggle"
    registry={genericEditors}
    schema={editorFixtures.toggle}
    validValue={true}
    invalidMessage="Required."
  />
);
