import type { ReactElement } from "react";
import { useHashTarget } from "../hooks/useHashTarget";
import { pages } from "../content/pages";
import { builderExport, builderGroups, viewerGroups } from "../content/possibilities";
import { AgentPossibilities } from "./AgentPossibilities";
import { builderAreas, learnMoreAreas } from "../content/learnMore";
import { CapabilityGroupView } from "./CapabilityGroupView";
import { LearnMoreBand } from "./LearnMoreBand";
import { LearnMoreChapter } from "./LearnMoreChapter";
import { LinkButton } from "./LinkButton";
import { Section } from "./Section";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import { WhatYouNeed } from "./WhatYouNeed";

// The bands alternate starting on the surface tone; the older sections below keep alternating after them.
const afterBands = (offset: number): "plain" | "surface" =>
  (learnMoreAreas.length + offset) % 2 === 0 ? "surface" : "plain";

export const PossibilitiesApp = (): ReactElement => {
  useHashTarget();
  return (
    <>
      <SiteHeader page="possibilities" />
      <main id="main" tabIndex={-1}>
        <WhatYouNeed />
        <LearnMoreChapter id="viewer" title="Let's Talk Integration" tone="surface" />
        {/* The chapter title and the first band share a background; bands alternate from there. */}
        {learnMoreAreas.map((area, index) => (
          <LearnMoreBand key={area.id} area={area} tone={index % 2 === 0 ? "surface" : "plain"} />
        ))}
        <Section id="viewer-more" tone={afterBands(0)}>
          {viewerGroups.map((group) => (
            <CapabilityGroupView key={group.id} group={group} />
          ))}
        </Section>
        <Section
          id="builder"
          title="Let's Talk App (add-on)"
          size="large"
          tone={afterBands(1)}
          lead="The first idea was to give people an easy, drag-and-drop way to create their home and later reuse it in Home Assistant. The idea shifted a little when we realised we could expose the tools to an AI agent and let it build for us: all the furniture and all the rooms, just from a few pictures and a small sketch of your house and rooms with their dimensions. But enough about that. Let's talk features…"
        >
          {builderGroups.map((group) => (
            <CapabilityGroupView key={group.id} group={group} />
          ))}
        </Section>
        {builderAreas.map((area, index) => (
          <LearnMoreBand key={area.id} area={area} tone={afterBands(2 + index)} />
        ))}
        <Section id="builder-more" tone={afterBands(2 + builderAreas.length)}>
          <AgentPossibilities />
          <CapabilityGroupView group={builderExport} />
        </Section>
        <Section id="next" title="Try it on your own home" tone={afterBands(3 + builderAreas.length)}>
          <div data-site-actions="">
            <LinkButton href={pages.install} icon="chevronRight">
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
};
