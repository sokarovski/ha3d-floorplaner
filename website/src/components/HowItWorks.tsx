import type { ReactElement } from "react";
import { ScreenshotFigure } from "./ScreenshotFigure";
import { Section } from "./Section";

export const HowItWorks = (): ReactElement => (
  <Section
    id="how-it-works"
    title="How it works"
    tone="surface"
    lead="You author the home once in the builder; Home Assistant turns it into a view of your home you can use every day."
  >
    <ol data-site-flow="">
      <li data-site-flow-step="">
        <div data-site-flow-text="">
          <span data-site-flow-number="" aria-hidden="true">
            1
          </span>
          <h3>Draw and furnish in the builder</h3>
          <p>
            Lay out floors and rooms, place doors, windows, furniture and lights, and pick materials. The
            builder also works on its own, to model, save and export images of a home.
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
          <h3>Save, then bring it into Home Assistant</h3>
          <p>
            Save the house in the builder. In the Homeplan integration, select the house and press Upgrade:
            Home Assistant keeps its own verified copy, so the panel works even when the builder is not
            running.
          </p>
        </div>
        <div data-site-flow-media="">
          <ScreenshotFigure name="ha-house" />
        </div>
      </li>
      <li data-site-flow-step="">
        <div data-site-flow-text="">
          <span data-site-flow-number="" aria-hidden="true">
            3
          </span>
          <h3>Connect devices and use your home</h3>
          <p>
            Link lights and other objects to your Home Assistant entities. Then zoom into a room to see its
            state and control its devices, with the room's controls beside the 3D view.
          </p>
        </div>
        <div data-site-flow-media="">
          <ScreenshotFigure name="ha-room" />
        </div>
      </li>
    </ol>
  </Section>
);
