// Before navigating away, flush committed edits; block only if a failed write would lose work.
import { useEffect, useState } from "react";
import { useBlocker } from "react-router";
import type { EditorSession } from "../services/editorSession";
import { returnToOverview } from "../services/treeActions";

export type LeaveGuard = Readonly<{
  asking: boolean;
  leave: () => void;
  stay: () => void;
}>;

const unsaved = (session: EditorSession): boolean =>
  session.documents.getState().generation !== session.saves.getState().writtenGeneration;

export const useLeaveGuard = (session: EditorSession): LeaveGuard => {
  const [asking, setAsking] = useState(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname &&
      (session.ui.getState().mode !== "overview" || unsaved(session)),
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    returnToOverview(session);
    let cancelled = false;
    void session.save.flush().then((ok) => {
      if (cancelled) return;
      if (ok) blocker.proceed();
      else setAsking(true);
    });
    return () => {
      cancelled = true;
    };
  }, [blocker, session]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (session.documents.getState().generation !== session.saves.getState().writtenGeneration) {
        void session.save.flush();
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [session]);

  return {
    asking,
    leave: () => {
      setAsking(false);
      if (blocker.state === "blocked") blocker.proceed();
    },
    stay: () => {
      setAsking(false);
      if (blocker.state === "blocked") blocker.reset();
    },
  };
};
