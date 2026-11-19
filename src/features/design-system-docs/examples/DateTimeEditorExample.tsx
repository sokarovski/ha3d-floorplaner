import type { ReactElement } from "react";
import { genericEditors } from "../../../design-system/property-editors/genericEditors";
import { editorFixtures } from "../catalog/editorFixtures";
import { EditorStates } from "../components/EditorStates";

export const DateTimeEditorExample = (): ReactElement => (
  <EditorStates
    editor="dateTime"
    registry={genericEditors}
    schema={editorFixtures.dateTime}
    validValue={"2020-06-01T12:00:00"}
    invalidMessage="Enter a valid date and time."
  />
);
