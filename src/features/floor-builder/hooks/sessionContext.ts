// The single stable session reference for the Floor Builder subtree, plus narrow selector hooks.
import { createContext, useContext } from "react";
import { useStore } from "zustand";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { EditorSession } from "../services/editorSession";
import type { HistoryState, SaveState } from "../stores/documentStore";
import type { UiState } from "../stores/uiStore";

export const EditorSessionContext = createContext<EditorSession | undefined>(undefined);

export const useSession = (): EditorSession => {
  const session = useContext(EditorSessionContext);
  if (session === undefined) throw new Error("useSession must be used inside the Floor Builder");
  return session;
};

export const useHouse = <T>(select: (house: HouseDocument) => T): T => {
  const session = useSession();
  return useStore(session.documents, (state) => select(state.document));
};

export const useUi = <T>(select: (ui: UiState) => T): T => {
  const session = useSession();
  return useStore(session.ui, select);
};

export const useSaveState = <T>(select: (save: SaveState) => T): T => {
  const session = useSession();
  return useStore(session.saves, select);
};

export const useHistoryState = <T>(select: (history: HistoryState) => T): T => {
  const session = useSession();
  return useStore(session.history, select);
};
