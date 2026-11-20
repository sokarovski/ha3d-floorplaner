import type { ReactElement } from "react";
import { pages } from "../content/pages";
import { AnimatedClip } from "./AnimatedClip";
import { LinkButton } from "./LinkButton";
import { Section } from "./Section";

// The homepage's Home Assistant section: two bands (entities, then cards) alternating sides, and one closing line.
export const HomeAssistantWidgets = (): ReactElement => (
  <Section
    id="home-assistant"
    title="Made of Home Assistant's own entities and cards"
    align="center"
    lead="Homeplan doesn't replace your dashboards. It brings the entities and cards you already have into a 3D view of your home."
  >
    <div data-site-home-bands="">
      <div data-site-band="">
        <div data-site-band-text="">
          <h3>Your entities, live in 3D</h3>
          <ul data-site-band-list="">
            <li>Lights show on or off, with their brightness and colour</li>
            <li>Doors, windows and blinds open and close with their sensors</li>
            <li>A TV shows what is playing, an AC or air purifier shows when it runs</li>
            <li>A red sweep shows someone in a room</li>
          </ul>
        </div>
        <div data-site-band-media="">
          <AnimatedClip name="viewer-night-lights" caption={false} />
        </div>
      </div>
      <div data-site-band="" data-site-band-flip="">
        <div data-site-band-text="">
          <h3>Your cards, beside each room</h3>
          <ul data-site-band-list="">
            <li>Tap a room: the view zooms in and that room's dashboard cards appear beside it</li>
            <li>Tap, hold or double tap a lamp or device to run a Home Assistant action</li>
            <li>Hold a device to open Home Assistant's own controls for it</li>
          </ul>
        </div>
        <div data-site-band-media="">
          <AnimatedClip name="ha-light-toggle" caption={false} />
        </div>
      </div>
    </div>
    <div data-site-home-bands-close="">
      <p>
        Links to entities are Home Assistant settings, chosen with Home Assistant's own pickers. Your
        dashboards stay exactly as they are.
      </p>
      <LinkButton href={`${pages.possibilities}#viewer`} icon="chevronRight">
        See everything it can do
      </LinkButton>
    </div>
  </Section>
);
