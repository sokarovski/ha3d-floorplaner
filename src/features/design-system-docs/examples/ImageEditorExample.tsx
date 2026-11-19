import type { ReactElement } from "react";
import { applicationRegistry } from "../../floor-builder/services/editorRegistry";
import { domainEditorFixtures } from "../catalog/domainEditorFixtures";
import { DomainFixture } from "../components/DomainFixture";
import { EditorStates } from "../components/EditorStates";

export const ImageEditorExample = (): ReactElement => (
  <DomainFixture>
    <EditorStates
      editor="image"
      registry={applicationRegistry()}
      schema={domainEditorFixtures.image}
      validValue={"img_fixture01"}
      invalidMessage="Fixture validation message."
    />
  </DomainFixture>
);
