import type { ReactElement } from "react";
import { links } from "../content/links";
import { pages } from "../content/pages";
import { agentPrompt } from "../content/prompts";
import { CopyPrompt } from "./CopyPrompt";
import { Section } from "./Section";

export const AgentBuilding = (): ReactElement => (
  <Section
    id="ai-agent"
    title="Start with a sketch. Let an AI agent help build your home."
    lead="Give a browser-capable AI agent your floor-plan sketch and reference photos, and ask it to build your 3D home. The agent creates rooms, walls, openings, furniture and lighting through Homeplan's documented tools, leaving you an editable model to review and refine."
  >
    <div data-site-split="">
      <ol data-site-steps="">
        <li>
          <strong>Share your references with the agent.</strong> Attach the sketch and photos in your AI
          agent, with measurements where you have them.
        </li>
        <li>
          <strong>Open Homeplan in the agent's browser.</strong> Open a house, or let the agent create one
          from the Houses screen.
        </li>
        <li>
          <strong>Give it the prompt.</strong> The agent finds the builder's AI agent instructions, reads the
          guides and builds the model step by step.
        </li>
      </ol>
      <div data-site-stack="">
        <CopyPrompt prompt={agentPrompt} />
        <p data-site-note="">
          <a href={`${pages.possibilities}#builder-agents`}>Step-by-step guides for each agent</a> ·{" "}
          <a href={links.agentGuide}>Read the AI agent instructions</a>
        </p>
      </div>
    </div>
  </Section>
);
