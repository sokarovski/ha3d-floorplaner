import type { ReactElement } from "react";
import { applicationRegistry } from "../../floor-builder/services/editorRegistry";
import { domainEditorFixtures, fixtureMaterial } from "../catalog/domainEditorFixtures";
import { DomainFixture } from "../components/DomainFixture";
import { EditorStates } from "../components/EditorStates";

export const MaterialEditorExample = (): ReactElement => (
  <DomainFixture>
    <EditorStates
      editor="material"
      registry={applicationRegistry()}
      schema={domainEditorFixtures.material}
      validValue={fixtureMaterial}
      invalidMessage="Fixture validation message."
    />
  </DomainFixture>
);
