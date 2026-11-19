import type { ReactElement } from "react";
import { genericEditors } from "../../../design-system/property-editors/genericEditors";
import { editorFixtures } from "../catalog/editorFixtures";
import { EditorStates } from "../components/EditorStates";

export const AngleEditorExample = (): ReactElement => (
  <EditorStates
    editor="angle"
    registry={genericEditors}
    schema={editorFixtures.angle}
    validValue={90}
    invalidMessage="Enter an angle in degrees, e.g. 90 or 45°."
  />
);
