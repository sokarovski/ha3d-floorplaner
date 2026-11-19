// "Update to vN" for template instances (D07): one undoable command. Filled in by the template feature.
import type { EditorSession } from "./editorSession";

type VersionUpdater = (session: EditorSession, owner: unknown, version: number) => boolean;

let updater: VersionUpdater = () => false;

export const registerTemplateVersionUpdater = (next: VersionUpdater): void => {
  updater = next;
};

export const updateTemplateVersionFor = (session: EditorSession, owner: unknown, version: number): boolean =>
  updater(session, owner, version);
