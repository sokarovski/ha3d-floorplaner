import type { ReactElement } from "react";
import { links } from "../content/links";
import { pages } from "../content/pages";

export const SiteFooter = (): ReactElement => (
  <footer data-site-footer="">
    <div data-site-footer-inner="">
      <nav aria-label="Project" data-site-footer-links="">
        <a href={pages.possibilities}>Learn More</a>
        <a href={links.appRepository}>Source and app (ha3d-floorplaner)</a>
        <a href={links.integrationRepository}>Home Assistant integration (ha3d)</a>
        <a href={links.readme}>Documentation</a>
        <a href={links.issues}>Issues</a>
      </nav>
      <p>
        Homeplan is open source under the <a href={links.licence}>MIT licence</a>. It is an independent
        project, not affiliated with Home Assistant.
      </p>
    </div>
  </footer>
);
