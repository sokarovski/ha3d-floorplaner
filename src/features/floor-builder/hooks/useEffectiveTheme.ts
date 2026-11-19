// Follows the UI root's effective theme (data-theme) so viewport helpers match the interface.
import { useSyncExternalStore } from "react";
import type { HelperTheme } from "../../../renderer/runtimeTypes";
import { documentTheme } from "../../viewport/services/documentTheme";

const subscribe = (onChange: () => void): (() => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    observer.disconnect();
  };
};

export const useEffectiveTheme = (): HelperTheme => useSyncExternalStore(subscribe, documentTheme);
