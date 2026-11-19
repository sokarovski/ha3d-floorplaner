import type { ReactElement } from "react";
import { AnimatedClip } from "./AnimatedClip";
import { FeatureCard } from "./FeatureCard";
import { ScreenshotFigure } from "./ScreenshotFigure";
import { Section } from "./Section";

export const HomeAssistantWidgets = (): ReactElement => (
  <Section
    id="home-assistant"
    title="Made of Home Assistant's own entities and cards"
    lead="Homeplan does not replace your dashboards. It links the things in your 3D home to the entities you already have and shows your Home Assistant cards beside the rooms they belong to."
  >
    <div data-site-grid="" data-site-grid-2="">
      <ScreenshotFigure name="ha-widgets" />
      <AnimatedClip name="viewer-night-lights" />
    </div>
    <div data-site-grid="" data-site-grid-2="">
      <AnimatedClip name="ha-presence" />
      <ScreenshotFigure name="ha-room" />
    </div>
    <div data-site-grid="" data-site-grid-3="">
      <FeatureCard icon="edit" title="Link things to entities">
        <p>
          In the panel's Edit mode, pick a light, object, door, window or room and choose its entity with Home
          Assistant's own pickers. The links are Home Assistant settings; the house model itself holds no Home
          Assistant data.
        </p>
      </FeatureCard>
      <FeatureCard icon="light" title="Live state in 3D">
        <p>
          Lights show on or off with their brightness and colour, doors, windows and blinds open and close
          with their sensors, and a TV shows what it is playing. Small bubbles above a room can show values
          such as temperature or humidity.
        </p>
      </FeatureCard>
      <FeatureCard icon="pointer" title="Tap, hold, double tap">
        <p>
          Each gesture runs a Home Assistant dashboard action, set with the same action editor as your
          dashboards: toggle, more info, call an action, navigate and more. A light toggles on tap by default.
        </p>
      </FeatureCard>
      <FeatureCard icon="frame" title="Room cards and floor widgets">
        <p>
          Tap a room and the view zooms in while that room's tab of a dashboard you choose appears beside it.
          A floor can also show a dashboard tab's cards next to the house.
        </p>
      </FeatureCard>
      <FeatureCard icon="eye" title="Conditions">
        <p>
          Show a light, object or bubble only when a condition holds, written like Home Assistant's card
          conditions (state, numeric state, and/or). Rooms can show presence or an intrusion with a red sweep.
        </p>
      </FeatureCard>
      <FeatureCard icon="layers" title="Floors and the whole house">
        <p>
          A house with several floors opens as the whole house; move to a floor, then into a room. The sun and
          night sky follow Home Assistant's own sun.
        </p>
      </FeatureCard>
    </div>
  </Section>
);
