// Carpet Editor focus test (Phase 5.14): whether a double-click lands on the open carpet, so only a
// double-click clearly outside it leaves the editor. "On the carpet" is its box (in its own axes) grown by a
// small screen margin, so a double-click on a handle just outside a piece's edge does not exit.
import { indexEntities } from "@shared/domain/house/entityIndex";
import { insideGroupFrame } from "@shared/geometry/shapeGroup";
import type { ScreenPoint, ViewportRuntime } from "../../../renderer/runtimeTypes";
import { carpetFrame } from "../tools/carpetEditing";
import type { EditorSession } from "./editorSession";

const marginPx = 12;

export const insideOpenCarpet = (
  session: EditorSession,
  screen: ScreenPoint,
  runtime: ViewportRuntime | null,
): boolean => {
  const { focusCarpetId } = session.ui.getState();
  if (focusCarpetId === undefined || runtime === null) return false;
  const entities = indexEntities(session.documents.getState().document);
  const ref = entities.get(focusCarpetId);
  if (ref?.kind !== "carpet") return false;
  const host = entities.get(ref.areaId);
  const plan = runtime.planPointAt(screen.x, screen.y);
  if (host?.kind !== "area" || plan === null) return false;
  return insideGroupFrame(carpetFrame(host.value, ref.value), plan, marginPx * runtime.worldUnitsPerPixel());
};
