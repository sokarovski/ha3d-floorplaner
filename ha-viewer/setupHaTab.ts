// Settings' Setup HA tab (Phase 21.18): only the dev harness's fake Home Assistant registers it (harness.ts), so
// the viewer itself carries no fake HA code, just this hook. With it, Settings' footer shows Setup HA as its second
// tab, after House; the tab shows the registered element, which applies its changes at once (no Save).

export type SetupHaTab = Readonly<{
  subtitle: string;
  /** The tab's content, created once and kept while the page lives. */
  element: () => HTMLElement;
}>;

let registered: SetupHaTab | null = null;

export const registerSetupHaTab = (tab: SetupHaTab): void => {
  registered = tab;
};

export const setupHaTab = (): SetupHaTab | null => registered;
