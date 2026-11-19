// One place where feature modules register their tools, selection actions, and add handlers.
import { createReassignWallTool } from "../tools/reassignWallTool";
import { registerTool } from "../tools/toolRegistry";
import { registerSelectionActions } from "./selectionActions";
import { carpetOrderActions } from "./carpetOrderActions";
import { effectActions } from "./effectActions";
import { objectGroupActions } from "./objectGroupActions";
import { registerFurnishing } from "./furnishingRegistrations";
import { repairActions } from "./repairActions";
import { sharedWallActions } from "./sharedWallActions";

let registered = false;

export const registerFloorBuilderFeatures = (): void => {
  if (registered) return;
  registered = true;
  registerSelectionActions(sharedWallActions);
  registerTool("reassignWall", createReassignWallTool());
  registerSelectionActions(repairActions);
  registerSelectionActions(objectGroupActions);
  registerSelectionActions(carpetOrderActions);
  registerSelectionActions(effectActions);
  registerFurnishing();
};
