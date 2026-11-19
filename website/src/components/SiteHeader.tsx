import type { ReactElement } from "react";
import logoUrl from "../../../brand/ha3d-logo.svg";
import { links } from "../content/links";

export const SiteHeader = (): ReactElement => (
  <header data-site-header="">
    <a href="#main" data-site-skip-link="">
      Skip to content
    </a>
    <div data-site-header-inner="">
      <a href="#top" data-site-brand="">
        <img src={logoUrl} alt="" width={32} height={32} />
        <span>Homeplan</span>
      </a>
      <nav aria-label="Main" data-site-nav="">
        <a href="#features">Features</a>
        <a href="#how-it-works">How it works</a>
        <a href="#install">Get started</a>
        <a href={links.appRepository}>GitHub</a>
      </nav>
    </div>
  </header>
);
