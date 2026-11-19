import type { ReactElement } from "react";
import { applicationRegistry } from "../../floor-builder/services/editorRegistry";
import { domainEditorFixtures } from "../catalog/domainEditorFixtures";
import { DomainFixture } from "../components/DomainFixture";
import { EditorStates } from "../components/EditorStates";

export const ReferenceEditorExample = (): ReactElement => (
  <DomainFixture>
    <EditorStates
      editor="reference"
      registry={applicationRegistry()}
      schema={domainEditorFixtures.reference}
      validValue={"w_fixture001"}
      invalidMessage="Fixture validation message."
    />
  </DomainFixture>
);
