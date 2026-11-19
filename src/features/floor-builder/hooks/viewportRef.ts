// A stable reference to the active viewport runtime for actions outside the viewport (export, render).
import { createContext, useContext } from "react";
import type { RefObject } from "react";
import type { ViewportRuntime } from "../../../renderer/runtimeTypes";

export const ViewportRefContext = createContext<RefObject<ViewportRuntime | null> | undefined>(undefined);

export const useViewportRef = (): RefObject<ViewportRuntime | null> => {
  const ref = useContext(ViewportRefContext);
  if (ref === undefined) throw new Error("useViewportRef must be used inside the Floor Builder");
  return ref;
};
