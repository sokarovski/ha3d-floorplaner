import type { ReactElement } from "react";
import { links } from "../content/links";
import { Section } from "./Section";

// Route 1: the Homeplan app and the Marketplace integration, connected by discovery.
export const InstallWithApp = (): ReactElement => (
  <Section
    id="app"
    title="Automatic: everything in Home Assistant"
    tone="surface"
    lead="What most people will use. The builder runs as a Home Assistant app on the same machine, and the integration finds it by itself. Nothing to type, no addresses, no extra computer."
  >
    <div data-site-roomy="">
      <p data-site-requirement="">
        You need Home Assistant OS or a Supervised install (apps need the Supervisor), on an amd64 or aarch64
        machine. The Marketplace needs Home Assistant 2026.11 or newer.
      </p>
      <h3>Part 1: the builder app</h3>
      <ol data-site-steps="">
        <li>
          <strong>Add the app repository.</strong> In Home Assistant, go to{" "}
          <em>Settings → Apps → Install app</em> and add the repository{" "}
          <a href={links.appRepository}>github.com/sokarovski/ha3d-floorplaner</a>.
        </li>
        <li>
          <strong>Install Homeplan and start it.</strong> Home Assistant builds the app on your own device, so
          the first install takes a few minutes. Each update builds again, just as quickly.
        </li>
        <li>
          <strong>Open the builder.</strong> Choose <em>Homeplan</em> in the sidebar. If it is not there, turn
          on <em>Show in sidebar</em> on the app's page. The builder opens only through Home Assistant, so
          your Home Assistant login protects it.
        </li>
        <li>
          <strong>Look around, then build your own.</strong> Three demo houses are ready on the first start: a
          city apartment, a garden bungalow and a family house. Create your own house next to them, by hand or
          with an AI agent, and press Save.
        </li>
      </ol>
      <h3>Part 2: the integration</h3>
      <ol data-site-steps="">
        <li>
          <strong>Add it from the Marketplace.</strong> Go to <em>Settings → Marketplace → Add from link</em>,
          enter <a href={links.integrationRepository}>github.com/sokarovski/ha3d</a> and install Homeplan. The
          first time, the Marketplace asks you to connect GitHub.
        </li>
        <li>
          <strong>Accept the discovered app.</strong> Open <em>Settings → Devices &amp; services</em>.
          Homeplan shows up under <em>Discovered</em>; choose <em>Add</em> and confirm. If you installed the
          integration first, the card appears within about 15 minutes, or at once after restarting the app.
        </li>
        <li>
          <strong>Pick your house.</strong> The integration adds its own <em>Homeplan</em> panel to the
          sidebar: the 3D view of your home. Open it, choose <em>Setup your home</em> and then{" "}
          <em>Use this house</em>.
        </li>
        <li>
          <strong>Link your devices.</strong> In the panel's Edit mode, pick a light, door, window or device
          and choose its entity. From now on the 3D home shows what your real home is doing.
        </li>
      </ol>
      <p data-site-note="">
        Two sidebar entries are both called Homeplan: the app's opens the builder, the integration's opens the
        3D panel. The panel keeps working from its own copy of the house even when the app is stopped.
      </p>
    </div>
  </Section>
);
