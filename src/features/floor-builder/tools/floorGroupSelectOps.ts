// Select's shape groups in the floor plan (Phase 5.14 carpets, Phase 7.2 rooms), in the overview and the Room
// Editor: hovering a carpet outlines it and names it; a selected carpet or a selected room shows its box with
// corner and side handles that resize all its shapes together (shapeGroupSelectOps.ts). A room's walls follow
// their anchored floor edges (D04); its objects, lights, and carpets keep their place. Turning a carpet or a
// room is the Rotate tools' (Q, Rotate area), as for everything else (owner, Phase 5 follow-up). Select
// delegates to these operations before its own handling.
import { replaceShapeGroupGeometryCommand } from "@shared/domain/commands/shapeCommands";
import { indexEntities } from "@shared/domain/house/entityIndex";
import { areaToFloorAffine } from "@shared/geometry/placement";
import { shapeGroupFrame } from "@shared/geometry/shapeGroup";
import type { OverlayPrimitive, RuntimePointerEvent } from "../../../renderer/runtimeTypes";
import { carpetFrame, carpetOutlineInFloor } from "./carpetEditing";
import { pickedEntity } from "./instanceDrag";
import { createShapeGroupSelectOps } from "./shapeGroupSelectOps";
import type { ShapeGroupSelectOps, ShapeGroupTarget } from "./shapeGroupSelectOps";
import { areaById, houseOf } from "./toolContext";
import type { ToolEnv } from "./toolTypes";

/** The selected carpet or room as a shape group, when exactly one is selected outside the Carpet Editor. */
const selectedFloorGroup = (env: ToolEnv): ShapeGroupTarget | undefined => {
  const { selection, activeFloorId, focusCarpetId, focusWallFace } = env.session.ui.getState();
  if (selection.length !== 1 || selection[0] === undefined) return undefined;
  if (focusCarpetId !== undefined || focusWallFace !== undefined) return undefined;
  const ref = indexEntities(houseOf(env)).get(selection[0]);
  if (ref?.kind === "carpet") {
    const area = areaById(env, ref.areaId);
    const carpet = ref.value;
    if (area === undefined || carpet.shapes.length === 0) return undefined;
    return {
      noun: "carpet",
      shapes: carpet.shapes,
      frame: carpetFrame(area, carpet),
      resize: (shapes) =>
        replaceShapeGroupGeometryCommand(activeFloorId, area.id, carpet.id, { shapes }, "Resize carpet"),
    };
  }
  if (ref?.kind === "area" && ref.floorId === activeFloorId) {
    const area = ref.value;
    if (area.floor.shapes.length === 0) return undefined;
    return {
      noun: "room",
      shapes: area.floor.shapes,
      frame: shapeGroupFrame(area.floor.shapes, areaToFloorAffine(area)),
      resize: (shapes) =>
        replaceShapeGroupGeometryCommand(activeFloorId, area.id, undefined, { shapes }, "Resize room"),
    };
  }
  return undefined;
};

export const createFloorGroupSelectOps = (env: ToolEnv): ShapeGroupSelectOps => {
  const group = createShapeGroupSelectOps(env, () => selectedFloorGroup(env));
  let showingHover = false;

  const clearHover = (): void => {
    if (!showingHover) return;
    showingHover = false;
    env.setOverlay([]);
    env.setCue(undefined);
    env.setCursor("default");
  };

  return {
    ...group,
    hover: (event: RuntimePointerEvent) => {
      if (group.hover(event)) {
        showingHover = false;
        return true;
      }
      const picked = event.phase === "leave" ? undefined : pickedEntity(env, event);
      const area = picked?.kind === "carpet" ? areaById(env, picked.areaId) : undefined;
      if (picked?.kind !== "carpet" || area === undefined) {
        clearHover();
        return false;
      }
      showingHover = true;
      env.setOverlay(
        carpetOutlineInFloor(area, picked.value).polygons.map((polygon): OverlayPrimitive => ({
          kind: "polygon",
          points: polygon.outer,
          holes: polygon.holes,
          fillOpacity: 0.12,
          outline: true,
          tone: "accent",
        })),
      );
      env.setCue({
        lines: [],
        marker: null,
        label:
          env.session.ui.getState().mode === "area"
            ? `${picked.value.name} · double-click to edit its shape`
            : picked.value.name,
      });
      env.setCursor("default");
      return true;
    },
  };
};
