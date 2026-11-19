import type { ReactElement } from "react";
import { links } from "../content/links";
import { FeatureCard } from "./FeatureCard";
import { Section } from "./Section";

// DEV MODE: why it exists (change, reload, see it in Home Assistant), how a change is kept, and how to set it up.
export const DevMode = (): ReactElement => (
  <Section
    id="dev-mode"
    title="DEV MODE: change the code, reload, see it in Home Assistant"
    tone="surface"
    lead="DEV MODE lets you improve the builder and the Home Assistant panel on the fly. The panel loads its code and your house straight from the builder on your computer, so a change shows up the next time you reload the panel. No packaging, no reinstalling the integration or the app for every small change."
  >
    <div data-site-grid="" data-site-grid-3="">
      <FeatureCard icon="code" title="Live panel code">
        <p>
          Each time you reload the Homeplan panel, it takes the 3D viewer's code from your running{" "}
          <code>npm run dev</code>. Rename a variable, fix a bug or change a style, reload, and you see it in
          your real Home Assistant, with your real entities.
        </p>
      </FeatureCard>
      <FeatureCard icon="home" title="Live house">
        <p>
          The panel also takes the house's latest working state from the builder, including edits that are not
          saved yet. Move a lamp in the builder, reload the panel, and the lamp has moved.
        </p>
      </FeatureCard>
      <FeatureCard icon="upload" title="Keep it, without reinstalling">
        <p>
          Happy with a change? In the panel's Settings, House setup, press <em>Upgrade panel</em> to store the
          new viewer in Home Assistant, and <em>Upgrade</em> beside the house to store its latest Save. No new
          release, no reinstalling the integration or the app.
        </p>
      </FeatureCard>
    </div>
    <div data-site-roomy="">
      <p>
        Turn DEV MODE off and reload, and the panel runs from the copies stored in Home Assistant again. If
        your builder cannot be reached, the panel falls back to those copies and says so. Nothing refreshes
        while the panel stays open: a reload is what picks up the change.
      </p>
      <p data-site-requirement="">
        DEV MODE needs a builder you run from source with <code>npm run dev</code>; with the Homeplan app the
        switch is hidden. Upgrade panel replaces only the panel's viewer code: a change to the integration's
        Python code still needs the integration updated and Home Assistant restarted.
      </p>
      <h3>Set it up</h3>
      <ol data-site-steps="">
        <li>
          <strong>
            Run the builder with <code>npm run dev</code>.
          </strong>{" "}
          The development server listens on your network so Home Assistant can reach it.
        </li>
        <li>
          <strong>Allow your Home Assistant address.</strong> Copy <code>.env.example</code> to an untracked{" "}
          <code>.env.local</code>, set <code>HOMEPLAN_HA_ORIGINS=http://homeassistant.local:8123</code> to
          your own Home Assistant address, and restart <code>npm run dev</code>.
        </li>
        <li>
          <strong>Connect the panel.</strong> In the Homeplan panel, open Settings and go to House setup.
          Enter a builder address that both Home Assistant and your browser can reach, such as{" "}
          <code>http://&lt;your-computer&gt;:5173/</code>, press Connect and pick a house.
        </li>
        <li>
          <strong>Turn on DEV MODE and reload the page.</strong> From now on every reload shows your latest
          code and house.
        </li>
        <li>
          <strong>Keep what you like.</strong> Run <code>npm run build:ha-viewer</code> so the builder offers
          the new viewer, then press Upgrade panel; Save the house in the builder and press Upgrade beside it.
          Turn DEV MODE off and reload: the panel now runs from Home Assistant's own copies, without your
          computer.
        </li>
      </ol>
      <p data-site-note="">
        If Home Assistant is served over HTTPS, the builder must be too, with a certificate the browser
        trusts. The <a href={links.readme}>README</a> explains how.
      </p>
    </div>
  </Section>
);
