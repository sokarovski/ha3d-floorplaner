// The versioned mount protocol used by both the dev URL and the production artifact.
import "./elements";
import { HomeplanIntegrationApp } from "./integrationApp";
import { createIntegrationClient } from "./integrationClient";
import type { Hass } from "./hassStore";
import type { IntegrationContext, MountedViewer } from "./integrationContext";

export const protocol = 1;
export const apiProtocol = 1;
if (customElements.get("homeplan-integration-app") === undefined)
  customElements.define("homeplan-integration-app", HomeplanIntegrationApp);

export const mount = (host: HTMLElement, context: IntegrationContext): MountedViewer => {
  // The viewer validates every integration response with its own schemas, never the loader's (Phase 14.7:
  // a loader cached or shipped with an older integration rejected fields a newer viewer and store both
  // know). The loader's client is used only for its bootstrap; the same HA auth is shared.
  let hass: Hass = context.hass;
  const client = createIntegrationClient(() => hass);
  const app = new HomeplanIntegrationApp();
  host.replaceChildren(app);
  app.configure({ ...context, client });
  return {
    setHass: (next) => {
      hass = next;
      app.setHass(next);
    },
    setNarrow: (narrow) => {
      app.setNarrow(narrow);
    },
    dispose: () => {
      app.dispose();
    },
  };
};
