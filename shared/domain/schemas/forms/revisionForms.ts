// Save with note (D09).
import Type from "typebox";
import type { Static } from "typebox";
import { hp } from "../annotations";

export const saveWithNoteForm = Type.Object(
  {
    message: Type.Optional(
      Type.String({
        title: "Note",
        maxLength: 500,
        ...hp({ editor: "text", placeholder: "What changed?", order: 1 }),
      }),
    ),
  },
  {
    $id: "urn:homeplan:form:save-with-note:1",
    additionalProperties: false,
    ...hp({ title: "Save with note", submitLabel: "Save revision", size: "sm" }),
  },
);
export type SaveWithNoteForm = Static<typeof saveWithNoteForm>;
