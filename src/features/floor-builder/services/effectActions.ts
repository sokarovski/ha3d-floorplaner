// Selection actions for ambient effects (D24, spec/builder/features/ambient-effects.md): "Add effect" on one
// object adds a red swirl above it and selects it, so its properties show and its preview plays.
import {
  addEffectCommand,
  maxEffectsPerObject,
  newAmbientEffect,
} from "@shared/domain/commands/effectCommands";
import type { SelectionActionProvider } from "./selectionActions";

export const effectActions: SelectionActionProvider = (session, refs) => {
  const only = refs.length === 1 ? refs[0] : undefined;
  if (only?.kind !== "object" || (only.value.effects ?? []).length >= maxEffectsPerObject) return [];
  return [
    {
      id: "add-effect",
      label: "Add effect",
      run: () => {
        const effect = newAmbientEffect();
        const house = session.documents.getState().document;
        if (session.execute(addEffectCommand(house, only.id, effect)).ok)
          session.ui.setState({ selection: [effect.id] });
      },
    },
  ];
};

/** The tree's + → Effect on an object row: the same as the menu's Add effect. */
export const addEffectToObject = (
  session: Parameters<SelectionActionProvider>[0],
  objectId: string,
): void => {
  const effect = newAmbientEffect();
  const house = session.documents.getState().document;
  if (session.execute(addEffectCommand(house, objectId, effect)).ok)
    session.ui.setState({ selection: [effect.id] });
};
