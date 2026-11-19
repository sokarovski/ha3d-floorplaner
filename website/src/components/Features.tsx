import type { ReactElement } from "react";
import { pages } from "../content/pages";
import { FeatureCard } from "./FeatureCard";
import { LinkButton } from "./LinkButton";
import { ScreenshotFigure } from "./ScreenshotFigure";
import { Section } from "./Section";

export const Features = (): ReactElement => (
  <Section
    id="features"
    title="What it does"
    lead="One model of your home, from the first wall to the light switch."
  >
    <ScreenshotFigure name="builder-wide" />
    <div data-site-grid="" data-site-grid-3="">
      <FeatureCard icon="ruler" title="Build the home">
        <p>
          Draw rooms from measured dimensions, raise walls, add doors, windows, stairs and roofs, then furnish
          and choose materials. Every floor of the house in one 3D model.
        </p>
      </FeatureCard>
      <FeatureCard icon="sofa" title="Make it recognisable">
        <p>
          Place lights, furniture and everyday objects where they really are, so the model looks and reads
          like your home rather than a generic diagram.
        </p>
      </FeatureCard>
      <FeatureCard icon="home" title="Use it in Home Assistant">
        <p>
          Open the saved house in the Homeplan panel, move between rooms, see live device states and control
          lights and other devices right where they are.
        </p>
      </FeatureCard>
    </div>
    <div data-site-actions="">
      <LinkButton href={pages.possibilities} icon="chevronRight">
        See all possibilities
      </LinkButton>
    </div>
  </Section>
);
