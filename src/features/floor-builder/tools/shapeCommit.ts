// Where a shape just drawn goes: into the open shape group (floor shapes, a carpet, or a wall feature), or,
// in a wall face with no feature open, into a new feature that starts with it.
import { addReliefCommand } from "@shared/domain/commands/wallCommands";
import { addShapeCommand } from "@shared/domain/commands/shapeCommands";
import type { AreaValue } from "@shared/domain/schemas/area";
import type { ShapeValue } from "@shared/domain/schemas/shapes";
import { createWallFeature } from "../services/wallFeature";
import { faceOf, houseOf, roofFaceOf, shapeSetIdOf } from "./toolContext";
import { createId } from "@shared/domain/ids";
import { nextFreeName } from "@shared/domain/commands/naming";
import { addRoofHoleCommand, setRoofSheetCommand } from "@shared/domain/commands/roofCommands";
import { replaceOutline } from "@shared/geometry/roofSheet";
import { shapeOutline } from "@shared/geometry/shapeOutline";
import { openRoofOf } from "../services/roofSpace";

/** Points of a circle drawn as a roof outline (implementation convention: each one a pullable point). */
export const roofCircleSegments = 24;
import type { ToolEnv } from "./toolTypes";

/** Adds the drawn shape and selects it (the new feature, when there was none open); true when it worked. */
/** A drawn shape's ring in its area's coordinates (a circle as `roofCircleSegments` points). */
const shapeRing = (shape: ShapeValue): readonly Readonly<{ x: number; y: number }>[] =>
  shape.type === "circle"
    ? Array.from({ length: roofCircleSegments }, (_, k) => ({
        x: shape.positionMm.x + shape.radiusMm * Math.cos((2 * Math.PI * k) / roofCircleSegments),
        y: shape.positionMm.y + shape.radiusMm * Math.sin((2 * Math.PI * k) / roofCircleSegments),
      }))
    : shapeOutline(shape).ring;

export const commitNewShape = (env: ToolEnv, area: AreaValue, shape: ShapeValue): boolean => {
  const floorId = env.session.ui.getState().activeFloorId;
  // In a roof face (Phase 19.3) the shape is a new hole: drawn in face coordinates, stored on the roof sheet (plan).
  const roofFace = roofFaceOf(env);
  if (roofFace !== undefined) {
    const { roof } = roofFace;
    const hole = {
      id: createId("rh"),
      name: nextFreeName(
        (roof.holes ?? []).map((candidate) => candidate.name),
        "Hole",
      ),
      points: shapeRing(shape).map((point) => {
        const plan = roofFace.planOf(point);
        return { x: Math.round(plan.x * 1000) / 1000, y: Math.round(plan.y * 1000) / 1000 };
      }),
    };
    if (!env.session.execute(addRoofHoleCommand(floorId, roof.id, hole)).ok) return false;
    env.session.ui.setState({ selection: [hole.id], tool: "select" });
    return true;
  }
  // In a roof (Phase 19.1) the shape becomes the roof's new outline: a flat sheet, no break lines.
  const open = openRoofOf(houseOf(env), env.session.ui.getState());
  if (open !== undefined) {
    const ring = shapeRing(shape);
    const result = replaceOutline(ring, { point: () => createId("rp"), line: () => createId("rl") });
    if (!result.ok) {
      env.session.notify("warning", result.message);
      return false;
    }
    const outcome = env.session.execute(
      setRoofSheetCommand(floorId, open.roof.id, result.sheet, `New outline of ${open.roof.name}`),
    );
    if (!outcome.ok) return false;
    if (open.roof.lines.length > 0)
      env.session.notify(
        "info",
        "New outline: the roof is flat again; draw its break lines anew (Undo restores them).",
      );
    env.session.ui.setState({ selection: [], tool: "select" });
    return true;
  }
  const face = faceOf(env);
  const setId = shapeSetIdOf(env);
  if (face !== undefined && setId === undefined) {
    const feature = createWallFeature(face.wall, face.side, [shape]);
    if (!env.session.execute(addReliefCommand(floorId, area.id, face.wall.id, feature)).ok) return false;
    env.session.ui.setState({ selection: [feature.id], tool: "select" });
    return true;
  }
  if (!env.session.execute(addShapeCommand(floorId, area.id, shape, setId)).ok) return false;
  env.session.ui.setState({ selection: [shape.id], tool: "select" });
  return true;
};
