import type { ReactElement } from "react";
import { Tab, TabList, TabPanel, Tabs } from "react-aria-components";
import { agentGuides } from "../content/agentGuides";
import { CopyPrompt } from "./CopyPrompt";

// One tab per kind of AI agent, each with numbered steps and a prompt to copy.
export const AgentTabs = (): ReactElement => (
  <Tabs data-site-tabs="">
    <TabList aria-label="Choose your AI agent" data-site-tab-list="">
      {agentGuides.map((guide) => (
        <Tab key={guide.id} id={guide.id} data-site-tab="">
          {guide.label}
        </Tab>
      ))}
    </TabList>
    {agentGuides.map((guide) => (
      <TabPanel key={guide.id} id={guide.id} data-site-tab-panel="">
        <p data-site-tab-summary="">{guide.summary}</p>
        <CopyPrompt prompt={guide.prompt} />
        <ol data-site-steps="" data-site-steps-grid="">
          {guide.steps.map((step) => (
            <li key={step.title}>
              <strong>{step.title}</strong> {step.text}
              {step.code === undefined ? null : <pre data-site-code="">{step.code}</pre>}
            </li>
          ))}
        </ol>
      </TabPanel>
    ))}
  </Tabs>
);
