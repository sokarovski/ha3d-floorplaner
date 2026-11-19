import type { ReactElement } from "react";
import { genericEditors } from "../../../design-system/property-editors/genericEditors";
import { editorFixtures } from "../catalog/editorFixtures";
import { EditorStates } from "../components/EditorStates";

export const SegmentedEditorExample = (): ReactElement => (
  <EditorStates
    editor="segmented"
    registry={genericEditors}
    schema={editorFixtures.segmented}
    validValue={"auto"}
    invalidMessage="Choose a value."
  />
);
