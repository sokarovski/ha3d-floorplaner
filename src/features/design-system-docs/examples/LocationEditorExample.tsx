import type { ReactElement } from "react";
import { applicationRegistry } from "../../floor-builder/services/editorRegistry";
import { domainEditorFixtures } from "../catalog/domainEditorFixtures";
import { DomainFixture } from "../components/DomainFixture";
import { EditorStates } from "../components/EditorStates";

export const LocationEditorExample = (): ReactElement => (
  <DomainFixture>
    <EditorStates
      editor="location"
      registry={applicationRegistry()}
      schema={domainEditorFixtures.location}
      validValue={{
        latitudeDeg: 51.5074,
        longitudeDeg: -0.1278,
        timeZone: "Europe/London",
      }}
      invalidMessage="Fixture validation message."
    />
  </DomainFixture>
);
