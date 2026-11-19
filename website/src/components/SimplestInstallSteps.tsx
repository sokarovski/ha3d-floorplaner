import type { ReactElement } from "react";
import { links } from "../content/links";

// The simplest install route in four short steps, shared by the overview and the install page.
export const SimplestInstallSteps = (): ReactElement => (
  <ol data-site-steps="" data-site-roomy="">
    <li>
      <strong>Add the app.</strong> In <em>Settings → Apps → Install app</em>, add{" "}
      <a href={links.appRepository}>github.com/sokarovski/ha3d-floorplaner</a>, then install and start
      Homeplan.
    </li>
    <li>
      <strong>Add the integration.</strong> In <em>Settings → Marketplace → Add from link</em>, enter{" "}
      <a href={links.integrationRepository}>github.com/sokarovski/ha3d</a> and install Homeplan.
    </li>
    <li>
      <strong>Accept it.</strong> Under <em>Settings → Devices &amp; services</em>, add the discovered
      Homeplan.
    </li>
    <li>
      <strong>Build and use your home.</strong> Draw it in the builder (or let an AI agent do it), Save, then
      pick it in the Homeplan panel.
    </li>
  </ol>
);
