// Small accessors tools share.
import type { AreaValue } from "@shared/domain/schemas/area";
import type { BuildingFloorValue } from "@shared/domain/schemas/floor";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { LengthUnit } from "@shared/domain/schemas/house";
import { faceFloorOf, featureAsArea } from "../services/faceSpace";
import { drawnFloor } from "../services/hideActions";
import { wallFaceOf } from "../services/wallFace";
import type { WallFace } from "../services/wallFace";
import { carpetAsArea } from "./carpetEditing";
import { openRoofOf, roofAsArea, roofToolFloor } from "../services/roofSpace";
import type { RoofFaceView } from "../services/roofFace";
import { openRoofFaceOf, roofFaceArea, roofFaceFloor } from "../services/roofFace";
import type { ToolEnv } from "./toolTypes";

export const houseOf = (env: ToolEnv): HouseDocument => env.session.documents.getState().document;

const realFloorOf = (env: ToolEnv): BuildingFloorValue | undefined => {
  const floorId = env.session.ui.getState().activeFloorId;
  return houseOf(env).floors.find((floor) => floor.id === floorId);
};

let faceMemo: { house: HouseDocument; key: string; face: WallFace | undefined } | undefined;

/** The wall face open in the face view, if any (memoized per document). */
export const faceOf = (env: ToolEnv): WallFace | undefined => {
  const { activeFloorId, focusWallFace } = env.session.ui.getState();
  if (focusWallFace === undefined) return undefined;
  const house = houseOf(env);
  const key = `${activeFloorId}|${focusWallFace.wallId}|${focusWallFace.side}`;
  if (faceMemo?.house === house && faceMemo.key === key) return faceMemo.face;
  const face = wallFaceOf(house, activeFloorId, focusWallFace);
  faceMemo = { house, key, face };
  return face;
};

/** The roof face open in the roof face view (Phase 19.3), if any. */
export const roofFaceOf = (env: ToolEnv): RoofFaceView | undefined =>
  openRoofFaceOf(houseOf(env), env.session.ui.getState());

/**
 * The floor the shape tools work on. In a wall face it is the face's virtual floor (face coordinates: x along
 * the wall, y up), carrying the open feature and the snap geometry of the face.
 */
export const floorOf = (env: ToolEnv): BuildingFloorValue | undefined => {
  // A roof face (19.3): the face's virtual floor in face coordinates (its outline, holes and windows to snap to).
  const roofFace = roofFaceOf(env);
  if (roofFace !== undefined) return roofFaceFloor(roofFace);
  // A roof's level (Phase 19.1): the floor plus the roof's outline as a virtual area to snap to.
  const roof = openRoofOf(houseOf(env), env.session.ui.getState());
  if (roof !== undefined) return roofToolFloor(roof.floor, roof.roof);
  const floor = realFloorOf(env);
  const face = faceOf(env);
  return floor === undefined || face === undefined
    ? floor
    : faceFloorOf(floor, face, env.session.ui.getState().focusReliefId);
};

export const unitOf = (env: ToolEnv): LengthUnit => houseOf(env).units;

/** `floor` as drawn (Phase 7.5): hidden things are not snapped to. */
export const snapFloor = (env: ToolEnv, floor: BuildingFloorValue): BuildingFloorValue =>
  drawnFloor(floor, env.session.ui.getState());

/** The shape group open in an editor level below the room (a carpet or a wall feature), if any. */
export const shapeSetIdOf = (env: ToolEnv): string | undefined => {
  const { focusCarpetId, focusReliefId } = env.session.ui.getState();
  return focusCarpetId ?? focusReliefId;
};

export const focusArea = (env: ToolEnv): AreaValue | undefined => {
  // A roof face (19.3): Rectangle, Circle and Polygon draw a hole on an empty area in face coordinates.
  const roofFace = roofFaceOf(env);
  if (roofFace !== undefined) return roofFaceArea(roofFace);
  // A roof's level (Phase 19.1): Rectangle, Circle and Polygon draw a new outline on the roof as a virtual area.
  const roof = openRoofOf(houseOf(env), env.session.ui.getState());
  if (roof !== undefined) return roofAsArea(roof.roof);
  const { focusAreaId, focusCarpetId, focusReliefId } = env.session.ui.getState();
  const area = realFloorOf(env)?.areas.find((candidate) => candidate.id === focusAreaId);
  if (area === undefined) return area;
  const face = faceOf(env);
  if (face !== undefined)
    return featureAsArea(
      area,
      face.reliefs.find((relief) => relief.id === focusReliefId),
    );
  if (focusCarpetId === undefined) return area;
  const carpet = area.floor.carpets.find((candidate) => candidate.id === focusCarpetId);
  return carpet === undefined ? area : carpetAsArea(area, carpet);
};

export const areaById = (env: ToolEnv, areaId: string): AreaValue | undefined =>
  realFloorOf(env)?.areas.find((area) => area.id === areaId);

export const magnetic = (env: ToolEnv): boolean => env.session.ui.getState().magnetic;

/** Tools where Shift held at the press flips Auto-select for that press (owner, Phase 4 follow-up). */
const shiftFlipsAutoSelect: ReadonlySet<string> = new Set(["nudge", "rotateArea", "rotate"]);

/**
 * Auto-select as it applies to this pointer event: in Nudge and Rotate, holding Shift inverts the toggle
 * (off: Shift-click a different target selects it; on: Shift-click acts on the current selection).
 */
/** Whether holding Shift flips Auto-select for a press with this tool. */
export const toolFlipsAutoSelect = (tool: string): boolean => shiftFlipsAutoSelect.has(tool);

export const autoSelectFor = (env: ToolEnv, event: Readonly<{ shiftKey: boolean }>): boolean => {
  const { autoSelect, tool } = env.session.ui.getState();
  return shiftFlipsAutoSelect.has(tool) && event.shiftKey ? !autoSelect : autoSelect;
};

export const finishTool = (env: ToolEnv): void => {
  env.session.preview(undefined);
  env.setOverlay([]);
  env.setReadout(undefined);
  env.setCue(undefined);
  env.setCursor("default");
};
