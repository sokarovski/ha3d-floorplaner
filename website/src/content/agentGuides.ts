// Step-by-step guides for building a home with an AI agent, one per kind of agent (the possibilities page tabs).
export type AgentStep = Readonly<{
  title: string;
  text: string;
  code?: string;
}>;

export type AgentGuide = Readonly<{
  id: string;
  label: string;
  summary: string;
  steps: readonly AgentStep[];
  prompt: string;
}>;

const openBuilder: AgentStep = {
  title: "Open the Floor Builder in Chrome.",
  text: "Use the address you run Homeplan at, for example http://localhost:5173 for a local install. Stay on the Houses screen to let the agent create a house, or open the house you want it to work on.",
};

const review: AgentStep = {
  title: "Review the result and Save.",
  text: "Check the dimensions that matter: a sketch is not a measurement. Refine by hand or ask the agent for changes; every edit can be undone. Nothing is kept until you press Save.",
};

export const agentGuides: readonly AgentGuide[] = [
  {
    id: "chrome",
    label: "Claude in Chrome",
    summary: "Claude works in a side panel next to the builder, in the Chrome you already use.",
    steps: [
      {
        title: "Install Claude in Chrome.",
        text: "Add the Claude in Chrome extension from the Chrome Web Store and sign in with your Claude account.",
      },
      openBuilder,
      {
        title: "Open Claude next to the page.",
        text: "Click the Claude icon in the Chrome toolbar. The side panel opens beside the builder.",
      },
      {
        title: "Attach your sketch and photos.",
        text: "Drop the floor-plan sketch and the reference photos into the chat. Add any measurements you know.",
      },
      {
        title: "Paste the prompt and send it.",
        text: "When Claude asks to act on the Homeplan page, allow it. It reads the builder's AI agent instructions, then builds rooms, walls, openings, furniture and lights step by step while you watch.",
      },
      review,
    ],
    prompt: "Find AI Agent Instructions and using the images build my 3D Home.",
  },
  {
    id: "code",
    label: "Claude Code",
    summary:
      "Claude Code in your terminal drives the builder in Chrome through the Claude in Chrome extension.",
    steps: [
      {
        title: "Install Claude Code and Claude in Chrome.",
        text: "Claude Code uses the Claude in Chrome extension to control your browser, so install both and sign in with the same Claude account.",
      },
      openBuilder,
      {
        title: "Start Claude Code with Chrome.",
        text: "Put the sketch and photos in a folder, open a terminal there and start Claude Code connected to Chrome. In a session that is already running, type /chrome instead.",
        code: "claude --chrome",
      },
      {
        title: "Give it the prompt.",
        text: "Name the images and the builder address so Claude Code knows where to look. It reads the AI agent instructions in the page and builds the model.",
      },
      review,
    ],
    prompt:
      "Find AI Agent Instructions in the Homeplan builder at http://localhost:5173 and, using sketch.jpg and the photos in this folder, build my 3D Home.",
  },
  {
    id: "other",
    label: "Other agents",
    summary: "Any agent can do it when it can see images and run JavaScript in the page it is browsing.",
    steps: [
      {
        title: "Check what your agent can do.",
        text: "It must look at images and run JavaScript in the builder page's own context, where window.homeplan lives. A text-only model, or an extension that only runs isolated content scripts, cannot.",
      },
      {
        title: "Open the Floor Builder in the agent's browser.",
        text: "Use the address you run Homeplan at, for example http://localhost:5173 for a local install, on the Houses screen or with a house open.",
      },
      {
        title: "Share your references and give the prompt.",
        text: "Attach the sketch and photos with any measurements. The agent calls window.homeplan.describe() and window.homeplan.docs.read() for the tools and guides, then builds the model.",
      },
      review,
    ],
    prompt: "Find AI Agent Instructions and using the images build my 3D Home.",
  },
];
