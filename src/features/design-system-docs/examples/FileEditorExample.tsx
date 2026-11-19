import type { ReactElement } from "react";
import { genericEditors } from "../../../design-system/property-editors/genericEditors";
import { editorFixtures } from "../catalog/editorFixtures";
import { EditorStates } from "../components/EditorStates";

export const FileEditorExample = (): ReactElement => (
  <EditorStates
    editor="file"
    registry={genericEditors}
    schema={editorFixtures.file}
    validValue={undefined}
    invalidMessage="This file type is not supported."
  />
);
