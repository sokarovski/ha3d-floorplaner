// Selected objects (owner, Phase 5 follow-up): each shows its box in the selection tone; a single selected
// object standing on the floor or hung overhead also shows its Move cross (turning is the Rotate tool's).
// Doors, windows, and wall-hung objects (Phase 15.8) show their own box, never their wall's highlight; a single
// one also shows its stretch handles and Move cross (wallItemBox.ts).
import { indexEntities } from "@shared/domain/house/entityIndex";
import type { EntityRef } from "@shared/domain/house/entityIndex";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { OverlayPrimitive, ViewportRuntime } from "../../../renderer/runtimeTypes";
import { boxEdges, objectHandlesOverlay } from "../tools/objectSelectOps";
import { wallItemBox, wallItemHandlesOverlay, wallItemRefOf } from "../tools/wallItemBox";

export type ObjectOverlayView = Readonly<{
  topView: boolean;
  wallsVisible: boolean;
  /** Off in the wall face view, whose own tools edit the wall (the item keeps its box). */
  wallItemHandles: boolean;
}>;

type Boxed = Extract<EntityRef, { kind: "object" | "opening" }>;

export const selectedObjectsOverlay = (
  house: HouseDocument,
  selection: readonly string[],
  runtime: ViewportRuntime,
  view: ObjectOverlayView,
): readonly OverlayPrimitive[] => {
  const entities = indexEntities(house);
  const objects = selection.flatMap((id): Boxed[] => {
    const ref = entities.get(id);
    // A selected group shows each member's box.
    if (ref?.kind === "objectGroup")
      return ref.value.memberIds.flatMap((memberId): Boxed[] => {
        const member = entities.get(memberId);
        return member?.kind === "object" ? [member] : [];
      });
    // With walls off, openings are not drawn (Phase 4.5), so neither is their box.
    if (ref?.kind === "opening") return view.wallsVisible ? [ref] : [];
    return ref?.kind === "object" ? [ref] : [];
  });
  const single = objects.length === 1 && !selection.some((id) => entities.get(id)?.kind === "objectGroup");
  return objects.flatMap((ref) => {
    const corners = runtime.instanceBounds(ref.id);
    if (corners === null) return [];
    const wallItem = wallItemRefOf(house, ref.id);
    const box =
      single && view.wallItemHandles && wallItem !== undefined
        ? wallItemBox(house, runtime, wallItem)
        : undefined;
    const handles = !single
      ? []
      : box !== undefined
        ? wallItemHandlesOverlay(box, view.topView)
        : wallItem === undefined
          ? objectHandlesOverlay(corners)
          : [];
    return [...boxEdges(corners, "accentStrong"), ...handles];
  });
};
