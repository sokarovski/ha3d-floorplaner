import type { ReactElement } from "react";
import { Section } from "./Section";
import { SimplestInstallSteps } from "./SimplestInstallSteps";

// The very top of the install page: the simplest way, before any options.
export const InstallTldr = (): ReactElement => (
  <Section id="tldr" title="tl;dr" size="large">
    <div data-site-tldr-box="">
      <SimplestInstallSteps />
    </div>
  </Section>
);
