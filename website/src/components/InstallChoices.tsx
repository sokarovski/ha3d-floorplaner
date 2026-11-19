import type { ReactElement } from "react";
import { FeatureCard } from "./FeatureCard";
import { Section } from "./Section";

// After the TLDR: the three install routes and who each one is for.
export const InstallChoices = (): ReactElement => (
  <Section
    id="install"
    title="Ways to install"
    align="center"
    tone="surface"
    lead="But if you want more options, here they are."
  >
    <div data-site-grid="" data-site-grid-3="">
      <FeatureCard icon="home" title="Automatic">
        <p>
          What most people will use. The Homeplan app and the integration are installed from Home Assistant
          and find each other by themselves. <a href="#app">Install automatically</a>
        </p>
      </FeatureCard>
      <FeatureCard icon="code" title="Developer">
        <p>
          For developers, and for people whose Home Assistant has no apps (add-ons) because of how it is
          installed, such as Home Assistant Container or Core. The builder runs on your own computer or
          server. <a href="#local">Run the builder yourself</a>
        </p>
      </FeatureCard>
      <FeatureCard icon="settings" title="Custom">
        <p>
          For people who enjoy the terminal and like doing things the hard way: copy the integration into your
          configuration folder by hand. <a href="#manual">Install it by hand</a>
        </p>
      </FeatureCard>
    </div>
    <p data-site-note="">
      The routes can be mixed. An integration from the Marketplace can also connect to a builder you run
      yourself, and you can move from one route to another later.
    </p>
  </Section>
);
