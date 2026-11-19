import type { ReactElement } from "react";
import { useHashTarget } from "../hooks/useHashTarget";
import { pages } from "../content/pages";
import { InstallChoices } from "./InstallChoices";
import { InstallFlowChart } from "./InstallFlowChart";
import { InstallLocalRoute } from "./InstallLocalRoute";
import { InstallManualIntegration } from "./InstallManualIntegration";
import { InstallTldr } from "./InstallTldr";
import { InstallWithApp } from "./InstallWithApp";
import { LinkButton } from "./LinkButton";
import { Section } from "./Section";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import { Updating } from "./Updating";

// The install page: every route, one at a time, with room to read.
export const InstallApp = (): ReactElement => {
  useHashTarget();
  return (
    <>
      <SiteHeader page="install" />
      <main id="main" tabIndex={-1}>
        <InstallTldr />
        <InstallChoices />
        <InstallFlowChart />
        <InstallWithApp />
        <InstallLocalRoute />
        <InstallManualIntegration />
        <Updating />
        <Section id="next" title="Next steps">
          <div data-site-actions="">
            <LinkButton href={pages.possibilities} icon="chevronRight">
              Learn More
            </LinkButton>
            <LinkButton href={pages.developers} variant="secondary" icon="code">
              Developers: run from source
            </LinkButton>
          </div>
        </Section>
      </main>
      <SiteFooter />
    </>
  );
};
