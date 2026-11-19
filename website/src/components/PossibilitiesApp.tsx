import type { ReactElement } from "react";
import { pages } from "../content/pages";
import { builderExport, builderGroups, viewerGroups } from "../content/possibilities";
import { AgentPossibilities } from "./AgentPossibilities";
import { CapabilityGroupView } from "./CapabilityGroupView";
import { LinkButton } from "./LinkButton";
import { Section } from "./Section";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

export const PossibilitiesApp = (): ReactElement => (
  <>
    <SiteHeader page="possibilities" />
    <main id="main" tabIndex={-1}>
      <Section
        id="viewer"
        title="The Home Assistant viewer"
        lead="The Homeplan integration shows your saved house in a Home Assistant sidebar panel and links it to the entities and dashboards you already have."
      >
        {viewerGroups.map((group) => (
          <CapabilityGroupView key={group.id} group={group} />
        ))}
      </Section>
      <Section
        id="builder"
        title="All the ways to use the Floor Builder"
        tone="surface"
        lead="Draw your home from measurements, furnish and light it, and keep every saved version, by hand or with an AI agent."
      >
        {builderGroups.map((group) => (
          <CapabilityGroupView key={group.id} group={group} />
        ))}
        <AgentPossibilities />
        <CapabilityGroupView group={builderExport} />
      </Section>
      <Section id="next" title="Try it on your own home">
        <div data-site-actions="">
          <LinkButton href={`${pages.home}#install`} icon="chevronRight">
            Get started
          </LinkButton>
          <LinkButton href={pages.home} variant="secondary" icon="back">
            Back to the overview
          </LinkButton>
        </div>
      </Section>
    </main>
    <SiteFooter />
  </>
);
