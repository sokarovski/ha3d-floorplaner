import type { ReactElement } from "react";
import { links } from "../content/links";
import { CommandBlock } from "./CommandBlock";
import { InstallMode } from "./InstallMode";
import { Section } from "./Section";

export const Installation = (): ReactElement => (
  <Section
    id="install"
    title="Quick install"
    lead="Homeplan has two parts: the builder (a web app) and the Homeplan integration inside Home Assistant. Install them either way below, or mix the routes."
  >
    <div data-site-grid="" data-site-grid-2="">
      <InstallMode
        id="install-repository"
        title="Repository / automatic"
        summary="Install the Homeplan App and the integration from Home Assistant. The integration discovers the app and fills in the connection for you."
      >
        <p data-site-requirement="">
          Needs Home Assistant with app support for the builder, and Home Assistant 2026.11 or later for the
          Marketplace.
        </p>
        <ol data-site-steps="">
          <li>
            <strong>Install the Homeplan App.</strong> Go to <em>Settings → Apps → Install app</em>, add the
            app repository <a href={links.appRepository}>github.com/sokarovski/ha3d-floorplaner</a>, then
            install and start Homeplan. Home Assistant builds the app on your device, so the first install
            takes a while. Open the builder from the Home Assistant sidebar.
          </li>
          <li>
            <strong>Install the Homeplan integration.</strong> Go to{" "}
            <em>Settings → Marketplace → Add from link</em>, enter{" "}
            <a href={links.integrationRepository}>github.com/sokarovski/ha3d</a> and install Homeplan. This is
            a separate install from the app.
          </li>
          <li>
            <strong>Connect.</strong> Home Assistant shows Homeplan as discovered; confirm it to connect to
            the app. If nothing is discovered, add the integration and enter the builder address yourself.
            Then select a house and link your devices.
          </li>
        </ol>
      </InstallMode>
      <InstallMode
        id="install-local"
        title="Local / manual"
        summary="Run the builder on your own computer or another machine, and install the integration by hand if you want it in Home Assistant."
      >
        <p data-site-requirement="">Needs Node.js and Git on the machine that runs the builder.</p>
        <ol data-site-steps="">
          <li>
            <strong>Run the builder locally.</strong>
            <CommandBlock
              label="Commands to run the builder locally"
              lines={[
                `git clone ${links.appRepositoryGit}`,
                "cd ha3d-floorplaner",
                "npm ci",
                "npm run build",
                "npm start",
              ]}
            />
            Then open <code>http://localhost:4310</code>. Check the <a href={links.readme}>README</a> for the
            exact commands, requirements and settings. Using only the builder? You can stop here.
          </li>
          <li>
            <strong>Install the integration manually.</strong> Download the integration ZIP from the{" "}
            <a href={links.integrationReleases}>ha3d releases page</a>, extract it into{" "}
            <code>custom_components/homeplan/</code> in your Home Assistant configuration folder, and restart
            Home Assistant.
          </li>
          <li>
            <strong>Enter the builder address.</strong> Add Homeplan under{" "}
            <em>Settings → Devices &amp; services</em> and enter the builder's address. Home Assistant must be
            able to reach it over your network, so a builder that only listens on <code>localhost</code> is
            not enough; the README explains how to change that.
          </li>
        </ol>
      </InstallMode>
    </div>
    <p data-site-note="">
      The routes can be mixed: an integration installed from the Marketplace can also connect to a builder you
      run yourself, by entering its address. Either way, linking devices and choosing a house stay your
      decisions.
    </p>
  </Section>
);
