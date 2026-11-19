import type { ReactElement } from "react";
import logoUrl from "../../../brand/ha3d-logo.svg";
import { links } from "../content/links";
import { LinkButton } from "./LinkButton";
import { ScreenshotFigure } from "./ScreenshotFigure";

export const Intro = (): ReactElement => (
  <section id="top" aria-labelledby="intro-title" data-site-intro="">
    <div data-site-intro-inner="">
      <div data-site-intro-text="">
        <img src={logoUrl} alt="HA3D logo" width={96} height={96} data-site-intro-logo="" />
        <h1 id="intro-title">Build your home in 3D. Bring it into Home Assistant.</h1>
        <p data-site-lead="">
          Draw measured rooms, arrange furniture and lighting, and connect your model to Home Assistant to see
          device states and control your home in context. Homeplan runs on your own machine or as a Home
          Assistant app, and your house data stays there.
        </p>
        <div data-site-actions="">
          <LinkButton href="#install" icon="chevronDown">
            Quick install
          </LinkButton>
          <LinkButton href={links.appRepository} variant="secondary" icon="code">
            View on GitHub
          </LinkButton>
        </div>
      </div>
      <ScreenshotFigure name="planner-overview" priority />
    </div>
  </section>
);
