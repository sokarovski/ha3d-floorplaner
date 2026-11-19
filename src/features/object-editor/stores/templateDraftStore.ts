// The Object Editor's isolated draft (D07: template-draft history is separate from house Undo).
import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";
import type { TemplateDraftValue } from "@shared/contracts/templates";
import type { NodeRule, TemplateMetadata } from "@shared/domain/templates/metadata";

export type DraftContent = Readonly<{
  label: string;
  metadata: TemplateMetadata;
  nodeRules: Readonly<Record<string, NodeRule>>;
}>;

export type TemplateDraftState = Readonly<{
  draft: TemplateDraftValue;
  content: DraftContent;
  past: readonly DraftContent[];
  future: readonly DraftContent[];
  dirty: boolean;
  /** "" = the template (scene metadata); otherwise a node name. */
  selected: string;
}>;

export type TemplateDraftStore = Readonly<{
  store: StoreApi<TemplateDraftState>;
  edit: (next: DraftContent) => void;
  undo: () => void;
  redo: () => void;
  /** After a version save: refreshes the draft; clears `dirty` only if `submitted` is still the content. */
  markSaved: (draft: TemplateDraftValue, submitted: DraftContent) => void;
}>;

export const createTemplateDraftStore = (draft: TemplateDraftValue): TemplateDraftStore => {
  const store = createStore<TemplateDraftState>(() => ({
    draft,
    content: { label: draft.label, metadata: draft.prefilledMetadata, nodeRules: draft.nodeRules },
    past: [],
    future: [],
    dirty: draft.versions.length === 0,
    selected: "",
  }));
  return {
    store,
    edit: (next) => {
      store.setState((state) => ({
        content: next,
        past: [...state.past, state.content].slice(-200),
        future: [],
        dirty: true,
      }));
    },
    undo: () => {
      store.setState((state) => {
        const previous = state.past[state.past.length - 1];
        return previous === undefined
          ? state
          : {
              content: previous,
              past: state.past.slice(0, -1),
              future: [state.content, ...state.future],
              dirty: true,
            };
      });
    },
    redo: () => {
      store.setState((state) => {
        const next = state.future[0];
        return next === undefined
          ? state
          : {
              content: next,
              past: [...state.past, state.content],
              future: state.future.slice(1),
              dirty: true,
            };
      });
    },
    markSaved: (next, submitted) => {
      // Edits made while the save was in flight stay unsaved.
      store.setState((state) => ({ draft: next, dirty: state.content !== submitted }));
    },
  };
};
