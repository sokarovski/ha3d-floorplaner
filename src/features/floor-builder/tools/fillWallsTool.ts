// Fill walls (Phase 4.4, spec/builder/screens/floor-builder.md#create-and-raise-walls): clicking the floor of
// the room being edited replaces all of its walls with full walls around its outline (straight edges and
// circle arcs) at the house's default wall height. Hovering the floor tints it and previews the outline. One click is one
// undo step; removed doors and windows are reported, not confirmed, because Undo restores them.
import { fillWallsCommand } from "@shared/domain/commands/wallCommands";
import type { WallSettings } from "@shared/domain/commands/wallCommands";
import { effectiveWallHeightMm } from "@shared/domain/house/defaults";
import { computeAreaFloorGeometry } from "@shared/geometry/areaGeometry";
import type { AreaValue } from "@shared/domain/schemas/area";
import { formatLength } from "@shared/domain/units/lengthUnits";
import type { OverlayPrimitive, RuntimePointerEvent } from "../../../renderer/runtimeTypes";
import { boldPolyline } from "../services/boldPolyline";
import { boundaryPieces } from "./planGeometry";
import { finishTool, focusArea, houseOf, unitOf } from "./toolContext";
import type { ToolFactory } from "./toolTypes";

/** The room's existing wall settings when every wall agrees on them; otherwise the defaults. */
const sharedSettings = (area: AreaValue): WallSettings | undefined => {
  const [first, ...rest] = area.walls;
  if (first === undefined) return undefined;
  const materials = JSON.stringify(first.materials);
  const agree = rest.every(
    (wall) =>
      wall.thicknessMm === first.thicknessMm &&
      wall.alignment === first.alignment &&
      JSON.stringify(wall.materials) === materials,
  );
  return agree
    ? { thicknessMm: first.thicknessMm, alignment: first.alignment, materials: first.materials }
    : undefined;
};

/** Screen width of the outline of the walls a Fill would raise. */
const outlineWidthPx = 3;

export const createFillWallsTool = (): ToolFactory => (env) => {
  /** The focused room when the pointer is on its floor (not on a wall, not elsewhere). */
  const floorOfFocus = (event: RuntimePointerEvent): AreaValue | undefined => {
    const area = focusArea(env);
    const hit = event.hit;
    return area !== undefined && hit?.kind === "floor" && hit.areaId === area.id ? area : undefined;
  };

  /**
   * Hover preview (Phase 5.15, H18): the floor that would be walled lights up (hover tint, lighter than a
   * selection) and the boundary pieces that become walls draw as a bold line (3 px) in the strong tone.
   */
  const preview = (area: AreaValue): OverlayPrimitive[] => {
    const floor: OverlayPrimitive[] = computeAreaFloorGeometry(area).floorShape.polygons.map((polygon) => ({
      kind: "polygon",
      points: polygon.outer,
      holes: polygon.holes,
      fillOpacity: 0.2,
      outline: false,
      tone: "accent",
    }));
    return [
      ...floor,
      ...boundaryPieces(area).flatMap((piece) =>
        boldPolyline(piece.points, outlineWidthPx * env.runtime.worldUnitsPerPixel(), "accentStrong"),
      ),
    ];
  };

  const idleHint =
    "Click the room's floor to replace its walls with full walls around the outline (house default height).";

  const hoverHint = (area: AreaValue): string => {
    const count = boundaryPieces(area).length;
    const height = formatLength(effectiveWallHeightMm(houseOf(env)), unitOf(env));
    return `Click to fill ${area.name} with ${String(count)} wall${count === 1 ? "" : "s"} at ${height}.`;
  };

  const fill = (area: AreaValue): void => {
    const pieces = boundaryPieces(area);
    const heightMm = effectiveWallHeightMm(houseOf(env));
    const removedOpenings = area.walls.reduce((count, wall) => count + wall.objects.length, 0);
    const removedReliefs = area.walls.reduce((count, wall) => count + (wall.reliefs ?? []).length, 0);
    const removedWalls = area.walls.length;
    const { command, wallIds } = fillWallsCommand(
      env.session.ui.getState().activeFloorId,
      area.id,
      pieces.map((piece) => ({
        shapeId: piece.shapeId,
        edgeKey: piece.edgeKey,
        fromMm: piece.fromMm,
        toMm: piece.toMm,
      })),
      heightMm,
      sharedSettings(area),
    );
    if (!env.session.execute(command).ok) return;
    env.session.ui.setState({ selection: wallIds });
    const height = formatLength(heightMm, unitOf(env));
    const replaced =
      removedWalls === 0 ? "" : `Replaced ${String(removedWalls)} wall${removedWalls === 1 ? "" : "s"}; `;
    const openings =
      removedOpenings === 0
        ? ""
        : ` ${String(removedOpenings)} door${removedOpenings === 1 ? "" : "s"}/window${removedOpenings === 1 ? "" : "s"} removed. Undo restores them.`;
    const reliefs =
      removedReliefs === 0
        ? ""
        : ` ${String(removedReliefs)} box${removedReliefs === 1 ? "" : "es"}/niche${removedReliefs === 1 ? "" : "s"} removed${removedOpenings === 0 ? ". Undo restores them." : "."}`;
    env.session.notify(
      "info",
      `${replaced}${String(wallIds.length)} wall${wallIds.length === 1 ? "" : "s"} at ${height}.${openings}${reliefs}`,
    );
  };

  env.setHint(idleHint);
  return {
    isActive: () => false,
    pointer: (event) => {
      if (event.phase === "move" || event.phase === "leave") {
        const area = event.phase === "move" ? floorOfFocus(event) : undefined;
        env.setOverlay(area === undefined ? [] : preview(area));
        env.setHint(area === undefined ? idleHint : hoverHint(area));
        return;
      }
      if (event.phase !== "down" || event.button !== 0) return;
      const area = floorOfFocus(event);
      if (area === undefined) return;
      finishTool(env);
      fill(area);
    },
    key: () => false,
    cancel: () => {
      finishTool(env);
    },
  };
};
