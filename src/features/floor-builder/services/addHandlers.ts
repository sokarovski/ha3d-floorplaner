// Add-menu handlers contributed by later features (objects, lights, carpets, groups, openings, roofs).
import type { EditorSession } from "./editorSession";

export type AddHandler = (session: EditorSession, rowId: string) => void;

const handlers = new Map<string, AddHandler>();

export const registerAddHandler = (itemId: string, handler: AddHandler): void => {
  handlers.set(itemId, handler);
};

export const runAddHandler = (session: EditorSession, itemId: string, rowId: string): void => {
  const handler = handlers.get(itemId);
  if (handler === undefined) session.notify("info", "This item cannot be added yet.");
  else handler(session, rowId);
};
