// The hovered light's tooltip (Phase 5.11): its name and height next to the pointer, and when several pins
// are stacked under it, which one of them a click picks ("2 of 3 · click again for the next").
import { indexEntities } from "@shared/domain/house/entityIndex";
import { formatLength } from "@shared/domain/units/lengthUnits";
import type { RuntimePointerEvent } from "../../../renderer/runtimeTypes";
import type { Readout } from "../tools/toolTypes";
import type { EditorSession } from "./editorSession";

export const lightTipFor = (session: EditorSession, event: RuntimePointerEvent): Readout | undefined => {
  if (event.phase !== "move" || event.hit?.kind !== "light") return undefined;
  const house = session.documents.getState().document;
  const ref = indexEntities(house).get(event.hit.lightId);
  if (ref?.kind !== "light") return undefined;
  const stack = event.hit.stack;
  const text = [
    ref.value.name,
    formatLength(ref.value.elevationMm, house.units),
    ...(stack === undefined
      ? []
      : [`${String(stack.index + 1)} of ${String(stack.total)} · click again for the next`]),
  ].join(" · ");
  return { text, screen: event.screen };
};
