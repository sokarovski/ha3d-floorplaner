import type { ReactElement } from "react";
import { links } from "../content/links";
import { pages } from "../content/pages";
import { CommandBlock } from "./CommandBlock";
import { Section } from "./Section";

// Route 2: the builder on a computer or server the visitor already runs, alone or connected to Home Assistant.
export const InstallLocalRoute = (): ReactElement => (
  <Section
    id="local"
    title="Developer: the builder on your own computer"
    lead="For developers, and for Home Assistant installs without apps (add-ons), such as Home Assistant Container or Core. Also good when you only want to draw your home, or prefer to keep the builder on a desktop or a home server."
  >
    <div data-site-roomy="">
      <p data-site-requirement="">
        You need Node.js 20.19 or newer (Node 24 is recommended), npm 11 and Git, and a current Chromium-based
        browser with WebGL 2.
      </p>
      <h3>Start the builder</h3>
      <ol data-site-steps="">
        <li>
          <strong>Get the source and build it.</strong>
          <CommandBlock
            label="Commands to build and start the builder"
            lines={[
              `git clone ${links.appRepositoryGit}`,
              "cd ha3d-floorplaner",
              "npm ci",
              "npm run build",
              "npm start",
            ]}
          />
        </li>
        <li>
          <strong>Open it.</strong> Go to <code>http://localhost:4310</code>. On the first start you get the
          same three demo houses as the app. Your houses are kept in the <code>.homeplan-data</code> folder
          next to the source.
        </li>
        <li>
          <strong>That is all, if you only want the builder.</strong> Draw, furnish, save versions and export
          pictures; Home Assistant is optional.
        </li>
      </ol>
      <h3>Connect it to Home Assistant</h3>
      <ol data-site-steps="">
        <li>
          <strong>Let Home Assistant reach the builder.</strong> By default the builder only listens on its
          own computer. Start it with <code>HOST=0.0.0.0 npm start</code> so other machines on your network
          can reach it. There are no accounts, so do this only on a network you trust.
        </li>
        <li>
          <strong>Install the integration</strong> from the Marketplace (as in <a href="#app">Part 2 above</a>
          ) or <a href="#manual">by hand</a>.
        </li>
        <li>
          <strong>Enter the builder's address.</strong> Under{" "}
          <em>Settings → Devices &amp; services → Add integration → Homeplan</em>, enter the address, for
          example <code>http://192.0.2.10:4310/</code> with your computer's address. Then pick your house in
          the Homeplan panel and link your devices.
        </li>
      </ol>
      <p data-site-note="">
        Changing the builder's code or using DEV MODE? That is on the{" "}
        <a href={pages.developers}>Developers</a> page.
      </p>
    </div>
  </Section>
);
