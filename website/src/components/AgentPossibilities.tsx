import type { ReactElement, ReactNode } from "react";
import { Icon } from "../../../src/design-system/components/Icon/Icon";
import type { IconName } from "../../../src/design-system/components/Icon/icons";
import { links } from "../content/links";
import { AgentTabs } from "./AgentTabs";

type AgentItem = Readonly<{
  icon: IconName;
  title: string;
  text: ReactNode;
}>;

const items: readonly AgentItem[] = [
  {
    icon: "code",
    title: "Tools in the page",
    text: (
      <>
        <code>window.homeplan.describe()</code> lists every tool with its schemas and examples, and{" "}
        <code>window.homeplan.docs.read()</code> returns the guides. They are MCP-like, but not an MCP server.
      </>
    ),
  },
  {
    icon: "home",
    title: "From the Houses screen",
    text: "List, create, clone, rename, trash, restore and open houses. There is no permanent delete: only you can empty the Trash.",
  },
  {
    icon: "check",
    title: "Ordinary, checked edits",
    text: "Rooms, walls, doors, windows, objects, lights and carpets go through the builder's normal validated commands, so you can undo them and Save when you are happy.",
  },
  {
    icon: "upload",
    title: "Generated models",
    text: "An agent can import a GLB, glTF or STL model it made, save it as an object and place it.",
  },
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
    <header data-site-group-header="">
      <h3>What an agent can do</h3>
      <p>
        Everything goes through the builder's own tools.{" "}
        <a href={links.agentGuide}>Read the AI agent instructions</a>
      </p>
    </header>
    <ul aria-label="What an agent can do" data-site-capabilities="">
      {items.map((item) => (
        <li key={item.title} data-site-capability="">
          <span data-site-capability-icon="">
            <Icon name={item.icon} />
          </span>
          <div data-site-capability-text="">
            <h4>{item.title}</h4>
            <p>{item.text}</p>
          </div>
        </li>
      ))}
    </ul>
  </section>
);
