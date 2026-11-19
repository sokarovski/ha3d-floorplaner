import type { ReactElement } from "react";
import { links } from "../content/links";
import { CopyPrompt } from "./CopyPrompt";
import { Section } from "./Section";

const agentPrompt = "Find AI Agent Instructions and using the images build my 3D Home.";

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
        <li>
          <strong>Review the result.</strong> Check dimensions and details, refine by hand or with the agent,
          and Save. A rough sketch is not a measurement, so verify the sizes that matter.
        </li>
      </ol>
      <div data-site-stack="">
        <CopyPrompt prompt={agentPrompt} />
        <details data-site-details="">
          <summary>What the agent needs</summary>
          <p>
            Homeplan exposes structured browser tools on <code>window.homeplan</code> in the builder page:{" "}
            <code>window.homeplan.describe()</code> lists every tool with its input and output schemas and
            examples, and <code>window.homeplan.docs.read()</code> returns the guides. They are MCP-like, but
            they are not an MCP server and do not register themselves with an AI product.
          </p>
          <p>
            The agent must be able to look at images and to run JavaScript in the page it is browsing. A
            text-only model, or a tool that cannot reach the page, cannot do this. The agent interprets your
            images; Homeplan only runs its normal, validated editing commands.
          </p>
          <p>
            <a href={links.agentGuide}>Read the AI agent instructions</a>
          </p>
        </details>
      </div>
    </div>
  </Section>
);
