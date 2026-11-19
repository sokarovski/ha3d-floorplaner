import gettingStarted from "./guides/getting-started.md?raw";
import coordinates from "./guides/coordinates.md?raw";
import layout from "./guides/layout.md?raw";
import furnishing from "./guides/furnishing.md?raw";
import saving from "./guides/saving.md?raw";
import templates from "./guides/templates.md?raw";
import type { AgentGuide } from "./automationTypes";

export const agentGuides: readonly AgentGuide[] = [
  { id: "getting-started", title: "Getting started", markdown: gettingStarted },
  { id: "coordinates", title: "Coordinates and units", markdown: coordinates },
  { id: "layout", title: "Building a layout", markdown: layout },
  { id: "furnishing", title: "Objects and materials", markdown: furnishing },
  { id: "saving", title: "Saving and recovery", markdown: saving },
  { id: "templates", title: "Creating and placing templates", markdown: templates },
];
