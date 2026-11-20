// The website's live demo (spec/product/showcase-website.md#live-demo): <homeplan-panel> on the demo city
// apartment with the fake home of fakeHome.ts, read-only demo data (houseSource.ts, createDemoHouseSource) and
// real Home Assistant cards, through the fake Home Assistant it shares with the dev harness (fakeHaHost.ts).
import "./main";
import { demoDashboard, startFakeHa } from "./fakeHaHost";
import { createFakeHome } from "./fakeHome";

const panel = document.querySelector("homeplan-panel");
if (panel === null) throw new Error("The live demo page has no <homeplan-panel>.");
const home = createFakeHome();

const start = async (): Promise<void> => {
  // A visitor is no HA admin: the panel hides Edit mode and Settings.
  const fake = await startFakeHa({
    panel,
    home: () => home,
    dashboard: () => demoDashboard,
    admin: false,
    cardsBase: document.baseURI,
  });
  if (!fake.withCards()) throw new Error("The Home Assistant cards did not load.");
  const narrow = (): void => {
    Reflect.set(panel, "narrow", window.innerWidth < 870);
  };
  narrow();
  window.addEventListener("resize", narrow);
  Reflect.set(panel, "panel", {
    config: { mode: "demo", data_base: new URL("data/", document.baseURI).href },
  });
};

start().catch((error: unknown) => {
  console.error("[live demo]", error);
  const message = document.querySelector("#demo-error");
  if (message !== null) message.textContent = "The live demo could not start in this browser.";
});
