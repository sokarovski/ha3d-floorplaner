import type { ReactElement, ReactNode } from "react";
import type { ScreenshotName } from "../content/screenshots";
import { useHashTarget } from "../hooks/useHashTarget";
import { ScreenshotFigure } from "./ScreenshotFigure";
import { Section } from "./Section";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

type GuideStep = Readonly<{
  title: string;
  text: ReactNode;
  shot?: ScreenshotName;
}>;

// The full guide: in Home Assistant first (the dashboard and its tabs), then in Homeplan's Settings.
const steps: readonly GuideStep[] = [
  {
    title: "Create a hidden dashboard",
    text: (
      <>
        In Home Assistant go to <em>Settings → Dashboards → Add dashboard</em>, choose{" "}
        <em>New dashboard from scratch</em> and give it a name, for example <em>Homeplan rooms</em>. Turn off{" "}
        <em>Show in sidebar</em>: the dashboard only feeds Homeplan, so it does not need its own place in the
        sidebar. You can still open it from <em>Settings → Dashboards</em>.
      </>
    ),
  },
  {
    title: "Add a tab for each room",
    text: (
      <>
        Open the dashboard, press the pencil to edit it and add a tab (view) for every room, plus one for the
        whole floor if you want floor cards. Name each tab like its room, for example <em>Bedroom</em>:
        Homeplan then finds it by itself. Put the cards you want on each tab, such as lights, the thermostat
        or the TV. A sections view works best; Homeplan draws the cards in the same layout.
      </>
    ),
  },
  {
    title: "Choose the dashboard in Homeplan",
    text: (
      <>
        Open the Homeplan panel, press the pencil to switch on Edit mode and open <em>Settings</em>. With{" "}
        <em>House</em> selected, choose your dashboard under <em>Room cards → Dashboard</em>.
      </>
    ),
    shot: "side-cards-house",
  },
  {
    title: "Give each room its tab",
    text: (
      <>
        Select a room in the list. Under <em>Tab</em>, keep <em>Match by name</em> or pick the tab that holds
        its cards. <em>Columns</em> sets how wide the cards are (1 or 2), and <em>Show room title</em> puts
        the room's name above them. A room without a tab still opens, full-screen and without cards.
      </>
    ),
    shot: "side-cards-room",
  },
  {
    title: "Cards for the whole floor (optional)",
    text: (
      <>
        Select the floor in the list. Under <em>Floor widgets</em>, choose a <em>Widget tab</em>, its{" "}
        <em>Position</em> (left, right, above or below the house) and its <em>Columns</em>. Those cards stay
        beside the house and slide away while a room is open.
      </>
    ),
    shot: "side-cards-floor",
  },
  {
    title: "Save, then press Done",
    text: (
      <>
        Press <em>Save</em> in Settings, close it, and leave Edit mode with <em>Done</em>. Now click a room:
        the view zooms in and its cards slide in beside it. Close the room to go back to the whole floor. When
        you add cards to a tab later, they show up the next time the room opens.
      </>
    ),
  },
];

// The Side Cards page: what side cards are, the short version, and the full step-by-step setup.
export const SideCardsApp = (): ReactElement => {
  useHashTarget();
  return (
    <>
      <SiteHeader page="sideCards" />
      <main id="main" tabIndex={-1}>
        <Section
          id="side-cards"
          title="Side Cards"
          lead="Click a room in the 3D view and its Home Assistant cards appear beside it: the room's lights, climate, media and anything else you put there, as real Home Assistant cards."
        >
          <ScreenshotFigure name="ha-widgets" priority />
          <div data-site-roomy="">
            <p>
              To get cards to appear when you click a room, you first create a hidden dashboard in Home
              Assistant, with one tab for each room. In Homeplan's Settings, under House, you choose that
              dashboard as the source of the cards. Then you go to each room and choose which tab of that
              dashboard holds its cards. Save, close Settings and leave Edit mode by pressing Done. From then
              on, whenever you click a room, its cards appear on the side. You can even show cards for the
              whole floor, in the floor's settings.
            </p>
          </div>
        </Section>
        <Section
          id="guide"
          title="Set it up step by step"
          tone="surface"
          lead="First in Home Assistant, then in Homeplan. You need to be a Home Assistant administrator: Edit mode and Settings are only shown to admins."
        >
          <ol data-site-flow="">
            {steps.map((step, index) => (
              <li
                key={step.title}
                data-site-flow-step=""
                data-site-flow-step-wide={step.shot === undefined ? "" : undefined}
              >
                <div data-site-flow-text="">
                  <span data-site-flow-number="" aria-hidden="true">
                    {index + 1}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
                {step.shot === undefined ? null : (
                  <div data-site-flow-media="">
                    <ScreenshotFigure name={step.shot} />
                  </div>
                )}
              </li>
            ))}
          </ol>
        </Section>
      </main>
      <SiteFooter />
    </>
  );
};
