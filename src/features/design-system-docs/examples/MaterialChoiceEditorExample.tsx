import type { ReactElement } from "react";
import { applicationRegistry } from "../../floor-builder/services/editorRegistry";
import { domainEditorFixtures } from "../catalog/domainEditorFixtures";
import { DomainFixture } from "../components/DomainFixture";
import { EditorStates } from "../components/EditorStates";

export const MaterialChoiceEditorExample = (): ReactElement => (
  <DomainFixture>
    <EditorStates
      editor="materialChoice"
      registry={applicationRegistry()}
      schema={domainEditorFixtures.materialChoice}
      validValue={{ preset: "Wenge" }}
      invalidMessage="Fixture validation message."
    />
  </DomainFixture>
);
