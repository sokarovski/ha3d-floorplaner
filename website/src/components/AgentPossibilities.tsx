import type { ReactElement, ReactNode } from "react";
import { Icon } from "../../../src/design-system/components/Icon/Icon";
import type { IconName } from "../../../src/design-system/components/Icon/icons";
import { links } from "../content/links";
import { pages } from "../content/pages";
import { agentPrompt } from "../content/prompts";
import { CopyPrompt } from "./CopyPrompt";

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
    icon: "pointer",
    title: "Claude in Chrome",
    text: "A browser agent such as the Claude in Chrome extension can operate the builder directly in the page you have open.",
  },
  {
    icon: "code",
    title: "Coding agents with a browser",
    text: "Claude Code or another coding agent can do the same when it has a browser tool that runs JavaScript in the page, such as the Claude in Chrome connection or a browser automation MCP.",
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
        An agent that can see images and run JavaScript in the builder page can draw a home from your sketch
        and photos.
      </p>
    </header>
    <ul aria-label="Work with AI agents" data-site-capabilities="">
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
    <div data-site-split="">
      <CopyPrompt prompt={agentPrompt} />
      <div data-site-prose="">
        <p>
          Open Homeplan in the agent's browser, share your sketch and photos, and give it the prompt. It finds
          the builder's AI agent instructions and builds the model step by step. Check the sizes that matter:
          a sketch is not a measurement.
        </p>
        <p>
          <a href={links.agentGuide}>Read the AI agent instructions</a> ·{" "}
          <a href={`${pages.home}#ai-agent`}>How it works on the overview</a>
        </p>
      </div>
    </div>
  </section>
);
