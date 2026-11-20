import type { ReactElement } from "react";
import { pages } from "../content/pages";
import { ScreenshotFigure } from "./ScreenshotFigure";
import { Section } from "./Section";

export const HowItWorks = (): ReactElement => (
  <Section
    id="how-it-works"
    title="How it works"
    tone="surface"
    lead="Create your home once in the App, import and connect it in Home Assistant, then use it there every day."
  >
    <ol data-site-flow="">
      <li data-site-flow-step="">
        <div data-site-flow-text="">
          <span data-site-flow-number="" aria-hidden="true">
            1
          </span>
          <h3>Create it in the App</h3>
          <p>
            If your browser has an AI agent, such as Claude in Chrome, or you use Claude Code, let it do the
            drawing: give it a sketch of your floor plan and photos of your rooms, and it lays out the floors,
            walls, doors, windows, furniture and lights for you in minutes. You then check the sizes that
            matter, fine-tune by hand and Save.{" "}
            <a href={`${pages.possibilities}#builder-agents`}>Step-by-step guides for each agent</a>
          </p>
          <p>
            No AI agent? Draw the rooms yourself from measurements, place everything and pick materials. The
            App also works on its own, to model, save and export images of a home.
          </p>
        </div>
        <div data-site-flow-media="">
          <ScreenshotFigure name="planner-detail" />
        </div>
      </li>
      <li data-site-flow-step="">
        <div data-site-flow-text="">
          <span data-site-flow-number="" aria-hidden="true">
            2
          </span>
          <h3>Import and connect it in Home Assistant</h3>
          <p>
            In the Homeplan integration, select your saved house and press Upgrade. Home Assistant keeps its
            own copy, so the panel works even when the App is not running.
          </p>
          <p>
            Then, in the panel's Settings, link each lamp, sensor and device in the house to the Home
            Assistant entity it stands for.
          </p>
        </div>
        <div data-site-flow-media="">
          <ScreenshotFigure name="ha-link-settings" />
        </div>
      </li>
      <li data-site-flow-step="">
        <div data-site-flow-text="">
          <span data-site-flow-number="" aria-hidden="true">
            3
          </span>
          <h3>Use it in Home Assistant</h3>
          <p>
            Open the Homeplan panel and your home is there in 3D, live: lights, sun, doors and presence follow
            what is really happening. Zoom into a room to see its state and control its devices, with the
            room's cards beside the 3D view.
          </p>
        </div>
        <div data-site-flow-media="">
          <ScreenshotFigure name="ha-room" />
        </div>
      </li>
    </ol>
  </Section>
);
