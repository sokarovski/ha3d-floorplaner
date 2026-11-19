import type { ReactElement } from "react";
import { genericEditors } from "../../../design-system/property-editors/genericEditors";
import { editorFixtures } from "../catalog/editorFixtures";
import { EditorStates } from "../components/EditorStates";

export const Vector2LengthEditorExample = (): ReactElement => (
  <EditorStates
    editor="vector2Length"
    registry={genericEditors}
    schema={editorFixtures.vector2Length}
    validValue={{ x: 1200, y: -350 }}
    invalidMessage="Enter a length."
  />
);
