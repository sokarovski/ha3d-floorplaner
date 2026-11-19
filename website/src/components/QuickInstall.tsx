import type { ReactElement } from "react";
import { pages } from "../content/pages";
import { LinkButton } from "./LinkButton";
import { Section } from "./Section";
import { SimplestInstallSteps } from "./SimplestInstallSteps";

// The simplest route on the overview; every other route is on the install page.
export const QuickInstall = (): ReactElement => (
  <Section
    id="install"
    title="Quick install"
    tone="surface"
    lead="The easiest way: everything inside Home Assistant, in four steps."
  >
    <SimplestInstallSteps />
    <div data-site-actions="">
      <LinkButton href={pages.install} icon="chevronRight">
        More ways to install
      </LinkButton>
    </div>
  </Section>
);
