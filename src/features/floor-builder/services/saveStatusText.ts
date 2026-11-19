// Save status wording (D09: saving / written / saved / failed / conflict, plus changes since the last Save).
import type { SaveState } from "../stores/documentStore";

/** True when the document differs from the last revision; edits not yet compared count as different. */
export const hasUnsavedRevision = (save: SaveState, generation: number): boolean =>
  generation !== save.savedGeneration && generation !== save.matchesSavedGeneration;

export const saveStatusText = (
  save: SaveState,
  generation: number,
): Readonly<{ text: string; tone: "muted" | "success" | "warning" | "danger" }> => {
  const unsavedRevision = hasUnsavedRevision(save, generation);
  switch (save.status) {
    case "saving":
      return { text: "Writing…", tone: "muted" };
    case "pending":
      return { text: "Changes pending…", tone: "muted" };
    case "written":
      return {
        text: unsavedRevision ? "Written · not saved as a revision" : "Saved",
        tone: unsavedRevision ? "warning" : "success",
      };
    case "saved":
      return {
        text: unsavedRevision ? "Written · not saved as a revision" : "Saved",
        tone: unsavedRevision ? "warning" : "success",
      };
    case "failed":
      return { text: "Save failed · retrying", tone: "danger" };
    case "conflict":
      return { text: "Conflict", tone: "danger" };
  }
};
