import type { ReactElement } from "react";
import { applicationRegistry } from "../../floor-builder/services/editorRegistry";
import { domainEditorFixtures } from "../catalog/domainEditorFixtures";
import { DomainFixture } from "../components/DomainFixture";
import { EditorStates } from "../components/EditorStates";

export const FixtureEditorExample = (): ReactElement => (
  <DomainFixture>
    <EditorStates
      editor="templateVersion"
      registry={applicationRegistry()}
      schema={domainEditorFixtures.fixture}
      validValue={{ templateId: "pendant-light", templateVersion: 1 }}
      owner={{ id: "l_fixture001", fixture: null }}
      invalidMessage="Fixture validation message."
    />
  </DomainFixture>
);
