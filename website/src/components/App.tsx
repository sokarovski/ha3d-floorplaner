import type { ReactElement } from "react";
import { useHashTarget } from "../hooks/useHashTarget";
import { AgentBuilding } from "./AgentBuilding";
import { HomeAssistantWidgets } from "./HomeAssistantWidgets";
import { HowItWorks } from "./HowItWorks";
import { Intro } from "./Intro";
import { ProjectAim } from "./ProjectAim";
import { QuickInstall } from "./QuickInstall";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

export const App = (): ReactElement => {
  useHashTarget();
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        <Intro />
        <AgentBuilding />
        <HowItWorks />
        <HomeAssistantWidgets />
        <ProjectAim />
        <QuickInstall />
      </main>
      <SiteFooter />
    </>
  );
};
