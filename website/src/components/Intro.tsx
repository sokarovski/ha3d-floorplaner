import type { ReactElement } from "react";
import logoUrl from "../../../brand/ha3d-logo.svg";
import { pages } from "../content/pages";
import { screenshotUrl } from "../content/screenshots";
import { LinkButton } from "./LinkButton";

// Full-width hero: the demo apartment at night in the viewer, edge to edge, with the introduction over it.
export const Intro = (): ReactElement => (
  <section id="top" aria-labelledby="intro-title" data-site-hero="">
    <img
      src={screenshotUrl("viewer-night-hero.webp")}
      alt="The demo apartment in the Homeplan viewer at night, its living area and kitchen lit by their lamps."
      width={1456}
      height={660}
      loading="eager"
      decoding="async"
      data-site-hero-image=""
    />
    <div data-site-hero-shade="" />
    <div data-site-hero-inner="">
      <div data-site-hero-text="">
        <img src={logoUrl} alt="HA3D logo" width={96} height={96} data-site-intro-logo="" />
        <h1 id="intro-title">Build your home in 3D. Bring it into Home Assistant.</h1>
        <p data-site-hero-lead="">
          Draw measured rooms, arrange furniture and lighting, and connect your model to Home Assistant to see
          device states and control your home in context. Homeplan runs on your own machine or as a Home
          Assistant app, and your house data stays there.
        </p>
        <div data-site-actions="">
          <LinkButton href={pages.liveDemo} icon="play">
            Live demo
          </LinkButton>
          <LinkButton href="#install" variant="secondary" icon="chevronDown">
            Quick install
          </LinkButton>
        </div>
      </div>
    </div>
  </section>
);
