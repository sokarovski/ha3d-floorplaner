// Building floor commands: add (next free EtageN), move (placement of one or more floors, Phase 16.4), delete (never
// the last).
// Rename uses setProperty. A new floor goes above the highest one at the suggested elevation (Phase 16, owner
// 2026-11-18): that floor's finished floor + its tallest wall + the new slab's thickness, once; later edits to the
// floor below never move it.
import { createFloor } from "../house/defaults";
import { suggestedElevationAboveMm, topFloor } from "../house/floorPlacement";
import { defaultSlabThicknessMm, maxFloorElevationMm } from "../schemas/floor";
import type { HouseDocument } from "../schemas/house";
import { defineCommand } from "./command";
import type { Command } from "./command";
import { nextFreeName } from "./naming";

export const addFloorCommand = (house: HouseDocument): Readonly<{ command: Command; floorId: string }> => {
  const name = nextFreeName(
    house.floors.map((candidate) => candidate.name),
    "Etage",
    "",
  );
  const below = topFloor(house.floors);
  const floor = createFloor(
    name,
    below === undefined ? 0 : suggestedElevationAboveMm(below, house, defaultSlabThicknessMm),
  );
  return {
    floorId: floor.id,
    command: defineCommand(`Add floor ${floor.name}`, floor.id, (draft) => {
      draft.floors.push(floor);
      return undefined;
    }),
  };
};

/** A floor's new placement in the house (Phase 16.4): plan offset and finished-floor elevation, mm. */
export type FloorPlacementMove = Readonly<{
  floorId: string;
  positionMm: Readonly<{ x: number; y: number }>;
  elevationMm: number;
}>;

/**
 * Moves one or more floors as groups (Phase 16.4, owner 2026-11-18: Move moves the selection only; floors above do
 * not follow). One undo step for all of them. Values are rounded to 0.1 mm and the elevation kept in its range.
 */
export const moveFloorsCommand = (house: HouseDocument, moves: readonly FloorPlacementMove[]): Command => {
  const names = moves.map((move) => house.floors.find((floor) => floor.id === move.floorId)?.name ?? "");
  const label = moves.length === 1 ? `Move floor ${names[0] ?? ""}` : `Move ${String(moves.length)} floors`;
  const round = (value: number): number => Math.round(value * 10) / 10;
  return defineCommand(label, undefined, (draft) => {
    if (moves.length === 0) return "No floor to move.";
    for (const move of moves) {
      const floor = draft.floors.find((candidate) => candidate.id === move.floorId);
      if (floor === undefined) return "The floor no longer exists.";
      if (Math.abs(move.elevationMm) > maxFloorElevationMm)
        return `A floor's elevation must stay within ±${String(maxFloorElevationMm / 1000)} m.`;
      floor.positionMm = { x: round(move.positionMm.x), y: round(move.positionMm.y) };
      floor.elevationMm = round(move.elevationMm);
    }
    return undefined;
  });
};

export const deleteFloorCommand = (house: HouseDocument, floorId: string): Command => {
  const floor = house.floors.find((candidate) => candidate.id === floorId);
  return defineCommand(`Delete floor ${floor?.name ?? ""}`, undefined, (draft) => {
    if (draft.floors.length <= 1) return "The last floor cannot be deleted.";
    const index = draft.floors.findIndex((candidate) => candidate.id === floorId);
    if (index < 0) return "The floor no longer exists.";
    draft.floors.splice(index, 1);
    return undefined;
  });
};
