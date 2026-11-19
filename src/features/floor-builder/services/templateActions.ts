// "Edit template" on placed instances of house templates (opens the Object Editor).
import type { SelectionActionProvider } from "./selectionActions";

export const templateActions =
  (
    openEditor: (templateId: string) => void,
    isHouseTemplate: (templateId: string) => boolean,
  ): SelectionActionProvider =>
  (_session, refs) => {
    const first = refs[0];
    if (refs.length !== 1 || first === undefined) return [];
    const templateId =
      first.kind === "opening" || first.kind === "object"
        ? first.value.templateId
        : first.kind === "light"
          ? first.value.fixture?.templateId
          : undefined;
    if (templateId === undefined || !isHouseTemplate(templateId)) return [];
    return [
      {
        id: "editTemplate",
        label: "Edit object",
        run: () => {
          openEditor(templateId);
        },
      },
    ];
  };
