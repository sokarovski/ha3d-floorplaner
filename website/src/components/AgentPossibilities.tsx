import type { ReactElement } from "react";
import { links } from "../content/links";
import { AgentTabs } from "./AgentTabs";
import { LinkButton } from "./LinkButton";

// What an agent can do, as short bullets in the same style as the Learn More bands.
const bullets: readonly string[] = [
  "Every tool is listed in the page, with its schemas and examples",
  "Manage houses: list, create, clone, rename, trash and restore them",
  "Edits go through the builder's own checked commands, so you can undo them and Save when you are happy",
  "Import a model it made (GLB, glTF or STL), save it as an object and place it",
];

export const AgentPossibilities = (): ReactElement => (
  <section id="builder-agents" aria-labelledby="builder-agents-title" data-site-group="">
    <header data-site-group-header="">
      <h3 id="builder-agents-title">Work with AI agents</h3>
      <p>
        Give an AI agent your floor-plan sketch and photos, and it draws your home in the builder. Pick your
        agent and follow the steps.
      </p>
    </header>
    <AgentTabs />
    <div data-site-band-text="" data-site-agent-abilities="">
      <h3>What an agent can do</h3>
      <ul aria-label="What an agent can do" data-site-band-list="">
        {bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
      <div data-site-actions="">
        <LinkButton href={links.agentGuide} icon="chevronRight">
          Read the AI agent instructions
        </LinkButton>
      </div>
    </div>
  </section>
);
