import type { ReactElement } from "react";
import { applicationRegistry } from "../../floor-builder/services/editorRegistry";
import { domainEditorFixtures } from "../catalog/domainEditorFixtures";
import { DomainFixture } from "../components/DomainFixture";
import { EditorStates } from "../components/EditorStates";

export const TemplateVersionEditorExample = (): ReactElement => (
  <DomainFixture>
    <EditorStates
      editor="templateVersion"
      registry={applicationRegistry()}
      schema={domainEditorFixtures.templateVersion}
      validValue={1}
      owner={{ id: "o_fixture001", templateId: "window-style-1", templateVersion: 1 }}
      invalidMessage="Fixture validation message."
    />
  </DomainFixture>
);
