// Measurement guides, persisted per floor (D16).
import { createId } from "../ids";
import type { Vector2 } from "../schemas/values";
import { defineCommand } from "./command";
import type { Command } from "./command";

export const addGuideCommand = (
  floorId: string,
  kind: "line" | "point",
  aMm: Vector2,
  bMm: Vector2,
): Readonly<{ command: Command; guideId: string }> => {
  const guideId = createId("gd");
  return {
    guideId,
    command: defineCommand(kind === "line" ? "Add guide line" : "Add guide point", floorId, (draft) => {
      const floor = draft.floors.find((candidate) => candidate.id === floorId);
      if (floor === undefined) return "The floor no longer exists.";
      floor.guides.push({
        id: guideId,
        kind,
        visible: true,
        aMm: { x: aMm.x, y: aMm.y },
        bMm: { x: bMm.x, y: bMm.y },
      });
      return undefined;
    }),
  };
};

export const clearGuidesCommand = (floorId: string): Command =>
  defineCommand("Clear guides", floorId, (draft) => {
    const floor = draft.floors.find((candidate) => candidate.id === floorId);
    if (floor === undefined) return "The floor no longer exists.";
    floor.guides = [];
    return undefined;
  });
