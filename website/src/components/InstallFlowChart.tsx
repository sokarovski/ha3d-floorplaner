import type { ReactElement } from "react";
import { Icon } from "../../../src/design-system/components/Icon/Icon";
import { Section } from "./Section";

// "Still didn't decide?": a small flow chart from a few yes/no questions to an install route.
// Wide screens lay it out as a chart (grid areas); narrow screens read it top to bottom.
export const InstallFlowChart = (): ReactElement => (
  <Section id="decide" title="Still didn't decide?" lead="Let's do a flow chart then:" align="center">
    <div data-site-fc="" role="group" aria-label="Flow chart: which way to install">
      <p data-site-fc-question="" data-site-fc-area="q1">
        Are you a Home Assistant junkie?
      </p>
      <div data-site-fc-branch="" data-site-fc-area="b1">
        <span data-site-fc-arrow="" data-site-fc-arrow-side="">
          No <Icon name="chevronRight" size="sm" />
        </span>
        <span data-site-fc-end="">Close this tab</span>
      </div>
      <span data-site-fc-arrow="" data-site-fc-area="d1">
        Yes <Icon name="chevronDown" size="sm" />
      </span>

      <p data-site-fc-question="" data-site-fc-area="q2">
        Are you a developer?
      </p>
      <div data-site-fc-branch="" data-site-fc-area="b2">
        <span data-site-fc-arrow="" data-site-fc-arrow-side="">
          Yes <Icon name="chevronRight" size="sm" />
        </span>
        <a href="#local" data-site-fc-end="">
          Run the builder yourself
        </a>
      </div>
      <span data-site-fc-arrow="" data-site-fc-area="d2">
        No <Icon name="chevronDown" size="sm" />
      </span>

      <p data-site-fc-question="" data-site-fc-area="q3">
        Do you have a HAOS installation?
      </p>
      <div data-site-fc-branch="" data-site-fc-area="b3">
        <span data-site-fc-arrow="" data-site-fc-arrow-side="">
          Yes <Icon name="chevronRight" size="sm" />
        </span>
        <a href="#app" data-site-fc-end="">
          Install automatically
        </a>
      </div>
      <span data-site-fc-arrow="" data-site-fc-area="d3">
        No <Icon name="chevronDown" size="sm" />
      </span>
      <a href="#local" data-site-fc-end="" data-site-fc-area="e3">
        Run the builder yourself
      </a>

      <p data-site-fc-question="" data-site-fc-area="q4" data-site-fc-question-wild="">
        Are you crazy?
      </p>
      <span data-site-fc-arrow="" data-site-fc-area="d4">
        Yes <Icon name="chevronDown" size="sm" />
      </span>
      <a href="#manual" data-site-fc-end="" data-site-fc-area="e4">
        Install it by hand
      </a>
    </div>
  </Section>
);
