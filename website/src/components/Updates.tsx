import type { ReactElement } from "react";
import { links } from "../content/links";
import { Section } from "./Section";

export const Updates = (): ReactElement => (
  <Section
    id="updates"
    title="Updates and DEV MODE"
    tone="surface"
    lead="Home Assistant keeps its own copy of each house and of the panel, and you decide when they change."
  >
    <dl data-site-definitions="">
      <div>
        <dt>Upgrade (house)</dt>
        <dd>
          Press Upgrade beside a house in Homeplan's House setup to bring in its latest Save from the builder.
          Your device links, room settings and viewer settings in Home Assistant are kept.
        </dd>
      </div>
      <div>
        <dt>Upgrade panel</dt>
        <dd>
          Installs a newer version of the panel's 3D viewer from the builder. Reload the page to use it.
        </dd>
      </div>
      <div>
        <dt>Integration and app</dt>
        <dd>
          Update the integration through the Marketplace (or install a newer ZIP by hand), and the Homeplan
          App through <em>Settings → Apps</em>. These are separate from the two Upgrade actions.
        </dd>
      </div>
    </dl>
    <div id="dev-mode" data-site-subsection="">
      <h3>DEV MODE: work against the builder on your computer</h3>
      <p data-site-requirement="">
        For developers running the builder from source on their own computer with <code>npm run dev</code>. It
        is not for the Homeplan App: with the app, the switch is hidden and you update with Upgrade and
        Upgrade panel.
      </p>
      <p>
        With DEV MODE on, each fresh load of the Homeplan panel takes both the viewer code and the house's
        latest working state from your builder, including edits the builder has saved automatically, without
        an explicit Save. Changes appear when you reload the panel; nothing refreshes while the tab stays
        open. Turning DEV MODE off and reloading returns to the panel's local viewer and stored house copy. If
        your builder cannot be reached, the panel falls back to its local copy, when it has one, and says so.
      </p>
      <ol data-site-steps="">
        <li>
          <strong>
            Run the builder with <code>npm run dev</code>.
          </strong>{" "}
          The development server listens on your network so Home Assistant can reach it.
        </li>
        <li>
          <strong>Allow your Home Assistant address.</strong> Copy <code>.env.example</code> to an untracked{" "}
          <code>.env.local</code> and set <code>HOMEPLAN_HA_ORIGINS=http://homeassistant.local:8123</code> to
          your own Home Assistant address, then restart <code>npm run dev</code>.
        </li>
        <li>
          <strong>Connect the panel.</strong> In the Homeplan panel, open Settings and go to House setup.
          Enter a builder address that both Home Assistant and your browser can reach, such as{" "}
          <code>http://&lt;your-computer&gt;:5173/</code>, press Connect and pick a house.
        </li>
        <li>
          <strong>Turn on DEV MODE and reload the page.</strong>
        </li>
        <li>
          <strong>Back to everyday use.</strong> Save in the builder, press Upgrade beside the house (and
          Upgrade panel for new viewer code), then turn DEV MODE off and reload. The panel now runs from Home
          Assistant's own copies, without your computer.
        </li>
      </ol>
      <p data-site-note="">
        If Home Assistant is served over HTTPS, the builder must be too, with a certificate the browser
        trusts. See the <a href={links.readme}>README</a> for details.
      </p>
    </div>
  </Section>
);
