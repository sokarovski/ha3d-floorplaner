import type { ReactElement } from "react";
import { genericEditors } from "../../../design-system/property-editors/genericEditors";
import { editorFixtures } from "../catalog/editorFixtures";
import { EditorStates } from "../components/EditorStates";

export const SliderEditorExample = (): ReactElement => (
  <EditorStates
    editor="slider"
    registry={genericEditors}
    schema={editorFixtures.slider}
    validValue={0.75}
    invalidMessage="Must be at most 1."
  />
);
