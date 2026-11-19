import type { ReactElement } from "react";
import { AgentBuilding } from "./AgentBuilding";
import { Features } from "./Features";
import { HistoryHighlight } from "./HistoryHighlight";
import { HomeAssistantWidgets } from "./HomeAssistantWidgets";
import { HowItWorks } from "./HowItWorks";
import { Installation } from "./Installation";
import { Intro } from "./Intro";
import { ProjectAim } from "./ProjectAim";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import { Updates } from "./Updates";

export const App = (): ReactElement => (
  <>
    <SiteHeader />
    <main id="main" tabIndex={-1}>
      <Intro />
      <Features />
      <HistoryHighlight />
      <AgentBuilding />
      <HowItWorks />
      <HomeAssistantWidgets />
      <ProjectAim />
      <Installation />
      <Updates />
    </main>
    <SiteFooter />
  </>
);
