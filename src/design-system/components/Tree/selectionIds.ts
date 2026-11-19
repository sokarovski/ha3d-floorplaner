import type { Key, Selection } from "react-aria-components";

/** Converts a React Aria selection or key set to string IDs ("all" is not used by the house tree). */
export const selectionToIds = (selection: Selection | Set<Key>): readonly string[] =>
  selection === "all" ? [] : Array.from(selection, (key) => String(key));
