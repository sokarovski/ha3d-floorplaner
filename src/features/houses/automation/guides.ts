import gettingStarted from "./guides/getting-started.md?raw";
import type { AgentGuide } from "../../floor-builder/automation/automationTypes";

export const housesAgentGuides: readonly AgentGuide[] = [
  { id: "getting-started", title: "Managing houses", markdown: gettingStarted },
];
