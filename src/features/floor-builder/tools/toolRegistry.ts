// Tool ID → handler factory. Tools added by later milestones register here.
import type { ToolId } from "../stores/uiStore";
import { createCircleTool } from "./circleTool";
import { createCornerEditTool } from "./cornerEditTool";
import { createFillWallsTool } from "./fillWallsTool";
import { createNudgeTool } from "./nudgeTool";
import { createPolygonTool } from "./polygonTool";
import { createRaiseWallTool } from "./raiseWallTool";
import { createRectangleTool } from "./rectangleTool";
import { createRotateAreaTool } from "./rotateAreaTool";
import { createOverviewRotateTool, createRotateTool } from "./rotateTool";
import { createSelectTool } from "./selectTool";
import { createSplitWallTool } from "./splitWallTool";
import { createTapeTool } from "./tapeTool";
import type { ToolFactory } from "./toolTypes";
import { createFaceNudgeTool, createFacePushPullTool, createFaceSelectTool } from "./faceTools";
import { createTrimWallTool } from "./trimWallTool";
import { createFloorMoveTool, createHouseSelectTool } from "./houseTools";
import { createOrbitTool, createPanTool } from "./viewTools";
import { createRoofLineTool, createRoofMoveTool, createRoofSelectTool } from "./roofTools";
import { createRoofFaceMoveTool, createRoofFaceSelectTool, createRoofWindowTool } from "./roofItemTools";

const factories = new Map<ToolId, ToolFactory>([
  ["select", createSelectTool()],
  ["nudge", createNudgeTool()],
  ["cornerEdit", createCornerEditTool()],
  ["rotateArea", createOverviewRotateTool(createRotateAreaTool())],
  ["rotate", createRotateTool()],
  ["rectangle", createRectangleTool()],
  ["circle", createCircleTool()],
  ["polygon", createPolygonTool()],
  ["tape", createTapeTool()],
  ["raiseWall", createRaiseWallTool()],
  ["trimWall", createTrimWallTool()],
  ["splitWall", createSplitWallTool()],
  ["fillWalls", createFillWallsTool()],
  ["pan", createPanTool()],
  ["orbit", createOrbitTool()],
]);

export const registerTool = (id: ToolId, factory: ToolFactory): void => {
  factories.set(id, factory);
};

export const toolFactory = (id: ToolId): ToolFactory => factories.get(id) ?? createSelectTool();

/** Face view tools (Phase 5.1): the face versions of Select, Nudge, Rectangle, and Push/pull. */
const faceFactories = new Map<ToolId, ToolFactory>([
  ["select", createFaceSelectTool()],
  ["nudge", createFaceNudgeTool()],
  ["raiseWall", createFacePushPullTool()],
]);

export const faceToolFactory = (id: ToolId): ToolFactory | undefined => faceFactories.get(id);

/** Whole-house overview tools (Phase 16.4): floors as groups; any other tool falls back to Select there. */
const houseFactories = new Map<ToolId, ToolFactory>([
  ["select", createHouseSelectTool()],
  ["nudge", createFloorMoveTool()],
  ["pan", createPanTool()],
  ["orbit", createOrbitTool()],
]);

export const houseToolFactory = (id: ToolId): ToolFactory =>
  houseFactories.get(id) ?? createHouseSelectTool();

/**
 * A roof's editing level (Phase 19.1): its own Select, Move and Line; Rectangle, Circle and Polygon are the shared
 * shape tools (drawing a new outline), Orbit and Pan the camera tools; anything else falls back to Select.
 */
const roofFactories = new Map<ToolId, ToolFactory>([
  ["select", createRoofSelectTool()],
  ["nudge", createRoofMoveTool()],
  ["roofLine", createRoofLineTool()],
  ["rectangle", createRectangleTool()],
  ["circle", createCircleTool()],
  ["polygon", createPolygonTool()],
  ["pan", createPanTool()],
  ["orbit", createOrbitTool()],
]);

export const roofToolFactory = (id: ToolId): ToolFactory => roofFactories.get(id) ?? createRoofSelectTool();

/**
 * A roof face view (Phase 19.3): its own Select, Move and Roof window; Rectangle, Circle, Polygon (holes) and Pan
 * are the shared tools running in face coordinates (undefined here).
 */
const roofFaceFactories = new Map<ToolId, ToolFactory>([
  ["select", createRoofFaceSelectTool()],
  ["nudge", createRoofFaceMoveTool()],
  ["roofWindow", createRoofWindowTool()],
]);

export const roofFaceToolFactory = (id: ToolId): ToolFactory | undefined => roofFaceFactories.get(id);
