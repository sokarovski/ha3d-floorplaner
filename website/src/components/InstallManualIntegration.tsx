import type { ReactElement } from "react";
import { links } from "../content/links";
import { Section } from "./Section";

// Route 3: the integration copied into the configuration folder, for Home Assistant without the Marketplace.
export const InstallManualIntegration = (): ReactElement => (
  <Section
    id="manual"
    title="Custom: the integration by hand"
    tone="surface"
    lead="For people who enjoy the terminal and doing things the hard way, and for Home Assistant versions without the Marketplace (2025.7 and newer work)."
  >
    <div data-site-roomy="">
      <ol data-site-steps="">
        <li>
          <strong>Download the release.</strong> Get <code>homeplan.zip</code> from the{" "}
          <a href={`${links.integrationReleases}/latest`}>latest ha3d release</a>.
        </li>
        <li>
          <strong>Unzip it into its own folder.</strong> Create <code>custom_components/homeplan/</code> in
          your Home Assistant configuration folder and unzip the archive into it. The files are at the top of
          the archive, so <code>manifest.json</code> ends up at{" "}
          <code>custom_components/homeplan/manifest.json</code>.
        </li>
        <li>
          <strong>Restart Home Assistant.</strong> Then add Homeplan under{" "}
          <em>Settings → Devices &amp; services</em>: accept the discovered app, or enter your builder's
          address.
        </li>
      </ol>
      <p data-site-note="">
        To update by hand, replace the folder's contents with the newer archive and restart again. Your
        houses, device links and settings are stored outside this folder and are kept.
      </p>
    </div>
  </Section>
);
