import type { ReactElement } from "react";
import { genericEditors } from "../../../design-system/property-editors/genericEditors";
import { editorFixtures } from "../catalog/editorFixtures";
import { EditorStates } from "../components/EditorStates";

export const TextEditorExample = (): ReactElement => (
  <EditorStates
    editor="text"
    registry={genericEditors}
    schema={editorFixtures.text}
    validValue={"Living room"}
    invalidMessage="Enter a value."
  />
);
