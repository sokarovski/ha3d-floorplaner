import type { ReactElement } from "react";
import { applicationRegistry } from "../../floor-builder/services/editorRegistry";
import { domainEditorFixtures } from "../catalog/domainEditorFixtures";
import { DomainFixture } from "../components/DomainFixture";
import { EditorStates } from "../components/EditorStates";

export const ReferenceMultipleEditorExample = (): ReactElement => (
  <DomainFixture>
    <EditorStates
      editor="reference"
      registry={applicationRegistry()}
      schema={domainEditorFixtures.referenceMultiple}
      validValue={["l_fixture001", "l_fixture003"]}
      invalidMessage="Fixture validation message."
    />
  </DomainFixture>
);
