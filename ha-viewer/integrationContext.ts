import type { BootstrapValue } from "@shared/contracts/homeplanIntegration";
import type { Hass } from "./hassStore";
import type { IntegrationClient } from "./integrationClient";

export type IntegrationContext = Readonly<{
  client: IntegrationClient;
  bootstrap: BootstrapValue;
  remote: boolean;
  message: string | null;
  hass: Hass;
  narrow: boolean;
  fail: (error: unknown) => void;
}>;
export type MountedViewer = Readonly<{
  setHass: (hass: Hass) => void;
  setNarrow: (narrow: boolean) => void;
  dispose: () => void;
}>;
