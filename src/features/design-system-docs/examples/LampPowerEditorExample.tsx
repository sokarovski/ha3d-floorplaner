import type { ReactElement } from "react";
import { applicationRegistry } from "../../floor-builder/services/editorRegistry";
import { domainEditorFixtures } from "../catalog/domainEditorFixtures";
import { EditorStates } from "../components/EditorStates";

/** The owner is the light: its lamp type picks the presets (LED warm white here, then an untyped light). */
export const LampPowerEditorExample = (): ReactElement => (
  <>
    <EditorStates
      editor="lampPower"
      registry={applicationRegistry()}
      schema={domainEditorFixtures.lampPower}
      owner={{ lampType: "ledWarm" }}
      validValue={8.5}
      invalidMessage="Fixture validation message."
    />
    <EditorStates
      editor="lampPower"
      registry={applicationRegistry()}
      schema={domainEditorFixtures.lampPower}
      owner={{}}
      validValue={undefined}
      invalidMessage="Fixture validation message."
    />
  </>
);
