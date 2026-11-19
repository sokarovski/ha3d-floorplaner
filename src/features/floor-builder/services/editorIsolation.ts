// What the viewport fades (spec/builder/screens/floor-builder.md#editing-focus-in-room-editor):
// Room Editor isolates the focused area automatically and locks out the others; the overview never
// isolates (a room's frame button only fits it to the screen).
import type { AreaIsolation } from "../../../renderer/runtimeTypes";
import type { EditorMode, ToolId } from "../stores/uiStore";

export const editorIsolation = (
  mode: EditorMode,
  focusAreaId: string | undefined,
  showOthers: boolean,
  tool: ToolId,
  /** Carpet Editor (Phase 5.14): the room's own walls and objects fade so the carpet's pieces stand out. */
  carpetOpen = false,
): AreaIsolation | null => {
  if (mode !== "overview" && focusAreaId !== undefined)
    return {
      areaId: focusAreaId,
      others: showOthers ? "faded" : "hidden",
      fadeOwnContent: carpetOpen || ["rectangle", "circle", "polygon", "cornerEdit"].includes(tool),
      othersLocked: true,
    };
  return null;
};
