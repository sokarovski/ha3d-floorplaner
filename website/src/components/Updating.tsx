import type { ReactElement } from "react";
import { Section } from "./Section";

// How each part is updated and where the data lives; the Upgrade actions are separate from app and integration updates.
export const Updating = (): ReactElement => (
  <Section
    id="updates"
    title="Updates and your data"
    lead="Home Assistant keeps its own copy of each house and of the panel, and you decide when they change."
  >
    <dl data-site-definitions="">
      <div>
        <dt>The app and the integration</dt>
        <dd>
          Update the Homeplan app under <em>Settings → Apps</em>, and the integration through the Marketplace
          (or with a newer ZIP by hand). Both are released together under one version number.
        </dd>
      </div>
      <div>
        <dt>Upgrade (house)</dt>
        <dd>
          After you Save in the builder, press Upgrade beside the house in the panel's House setup to bring
          the new version into Home Assistant. Your device links, room settings and viewer settings are kept.
        </dd>
      </div>
      <div>
        <dt>Upgrade panel</dt>
        <dd>
          Installs a newer version of the panel's 3D viewer from the builder. Reload the page to use it.
        </dd>
      </div>
      <div>
        <dt>Backups</dt>
        <dd>
          With the app, your houses and their saved history are part of Home Assistant backups that include
          the app. Uninstalling the app deletes them, so make a backup first. A builder on your own computer
          keeps each house as a folder you can copy.
        </dd>
      </div>
    </dl>
  </Section>
);
