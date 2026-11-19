// Roof commands (Phase 19.1, spec/builder/features/roofs.md): Add roof and every sheet edit (break lines, pulled or
// moved points, outline changes, deletes) as one undoable step each. The sheet edits themselves are pure
// (shared/geometry/roofSheet.ts); a command writes the result into the roof after re-checking the guard rails.
import type { Draft } from "immer";
import { createCanopy, createRoof, canAddRoof, roofsOf } from "../house/roofs";
import type { HouseDocument } from "../schemas/house";
import type { RoofHoleValue, RoofValue, RoofWindowValue } from "../schemas/roof";
import type { Vec2 } from "../../geometry/vector";
import type { RoofSheet } from "../../geometry/roofSurface";
import { sheetProblem } from "../../geometry/roofSheet";
import { defineCommand } from "./command";
import type { Command } from "./command";
import { nextFreeName } from "./naming";

/** Add roof on the top floor: a flat roof over the floor's bounding box + 400 mm (owner decision 2). */
export const addRoofCommand = (
  house: HouseDocument,
  floorId: string,
): Readonly<{ command: Command; roofId: string }> | Readonly<{ message: string }> => {
  const floor = house.floors.find((candidate) => candidate.id === floorId);
  if (floor === undefined) return { message: "The floor no longer exists." };
  if (!canAddRoof(house, floor))
    return {
      message: roofsOf(floor).some((roof) => roof.cutsWalls)
        ? `${floor.name} already has a roof.`
        : "Only the top floor can have a roof.",
    };
  const roof = createRoof(floor, house, nextFreeName(roofNames(house), "Roof"));
  if (roof === null) return { message: `Draw ${floor.name}'s rooms before adding a roof.` };
  return {
    roofId: roof.id,
    command: defineCommand(`Add ${roof.name}`, floorId, (draft) => {
      const target = draft.floors.find((candidate) => candidate.id === floorId);
      if (target === undefined) return "The floor no longer exists.";
      target.roofs = [...(target.roofs ?? []), roof];
      return undefined;
    }),
  };
};

const draftRoof = (
  draft: Draft<HouseDocument>,
  floorId: string,
  roofId: string,
): Draft<RoofValue> | undefined =>
  draft.floors.find((floor) => floor.id === floorId)?.roofs?.find((roof) => roof.id === roofId);

/** Writes an edited sheet (points, outline, break lines) into the roof, after the guard rails. */
export const setRoofSheetCommand = (
  floorId: string,
  roofId: string,
  sheet: RoofSheet,
  label: string,
): Command =>
  defineCommand(label, floorId, (draft) => {
    const roof = draftRoof(draft, floorId, roofId);
    if (roof === undefined) return "The roof no longer exists.";
    const problem = sheetProblem(sheet);
    if (problem !== undefined) return problem;
    roof.points = sheet.points.map((point) => ({ ...point }));
    roof.outline = [...sheet.outline];
    roof.lines = sheet.lines.map((line) => ({ ...line }));
    return undefined;
  });

/** Sets the roof's eave height (dragging the whole roof up or down, or typed). */
export const setRoofEaveHeightCommand = (floorId: string, roofId: string, eaveHeightMm: number): Command =>
  defineCommand("Move roof", floorId, (draft) => {
    const roof = draftRoof(draft, floorId, roofId);
    if (roof === undefined) return "The roof no longer exists.";
    if (eaveHeightMm < 0) return "The roof cannot go below the floor.";
    roof.eaveHeightMm = Math.round(eaveHeightMm * 1000) / 1000;
    return undefined;
  });

/**
 * Moves a whole roof (Phase 19.5: a canopy moved with Move in its floor view, or the whole roof in its level): every
 * point by the plan offset, its holes and roof windows with them (they live on the roof sheet), and the eave height
 * by `by.h`. One undo step.
 */
export const moveRoofCommand = (
  floorId: string,
  roofId: string,
  by: Readonly<{ x: number; y: number; h: number }>,
  label: string,
): Command =>
  defineCommand(label, floorId, (draft) => {
    const roof = draftRoof(draft, floorId, roofId);
    if (roof === undefined) return "The roof no longer exists.";
    const eave = roof.eaveHeightMm + by.h;
    if (eave < 0) return "The roof cannot go below the floor.";
    const round = (value: number): number => Math.round(value * 1000) / 1000;
    roof.eaveHeightMm = round(eave);
    if (by.x === 0 && by.y === 0) return undefined;
    roof.points = roof.points.map((point) => ({
      ...point,
      x: round(point.x + by.x),
      y: round(point.y + by.y),
    }));
    for (const hole of roof.holes ?? [])
      hole.points = hole.points.map((point) => ({ x: round(point.x + by.x), y: round(point.y + by.y) }));
    for (const window of roof.windows ?? [])
      window.positionMm = { x: round(window.positionMm.x + by.x), y: round(window.positionMm.y + by.y) };
    return undefined;
  });

/** The names of every roof in the house (roofs and canopies share one name space). */
const roofNames = (house: HouseDocument): string[] =>
  house.floors.flatMap((each) => roofsOf(each).map((candidate) => candidate.name));

/**
 * Add canopy (Phase 19.3): an attached roof (Cuts walls off, it cuts nothing) on any floor, over an area (a room,
 * yard or terrace) or at the floor's centre (roofs.ts createCanopy).
 */
export const addCanopyCommand = (
  house: HouseDocument,
  floorId: string,
  areaId?: string,
): Readonly<{ command: Command; roofId: string }> | Readonly<{ message: string }> => {
  const floor = house.floors.find((candidate) => candidate.id === floorId);
  if (floor === undefined) return { message: "The floor no longer exists." };
  const area = areaId === undefined ? undefined : floor.areas.find((candidate) => candidate.id === areaId);
  if (areaId !== undefined && area === undefined) return { message: "The area no longer exists." };
  const canopy = createCanopy(floor, area, nextFreeName(roofNames(house), "Canopy"));
  return {
    roofId: canopy.id,
    command: defineCommand(`Add ${canopy.name}`, floorId, (draft) => {
      const target = draft.floors.find((candidate) => candidate.id === floorId);
      if (target === undefined) return "The floor no longer exists.";
      target.roofs = [...(target.roofs ?? []), canopy];
      return undefined;
    }),
  };
};

/** Adds a hole (19.3) drawn on the roof (its ring on the roof sheet, plan). */
export const addRoofHoleCommand = (floorId: string, roofId: string, hole: RoofHoleValue): Command =>
  defineCommand(`Add ${hole.name}`, floorId, (draft) => {
    const roof = draftRoof(draft, floorId, roofId);
    if (roof === undefined) return "The roof no longer exists.";
    if (hole.points.length < 3) return "A hole needs at least three points.";
    roof.holes = [...(roof.holes ?? []), { ...hole, points: hole.points.map((point) => ({ ...point })) }];
    return undefined;
  });

/** Adds a roof window (19.3) at its place on the roof sheet. */
export const addRoofWindowCommand = (floorId: string, roofId: string, window: RoofWindowValue): Command =>
  defineCommand(`Add ${window.name}`, floorId, (draft) => {
    const roof = draftRoof(draft, floorId, roofId);
    if (roof === undefined) return "The roof no longer exists.";
    roof.windows = [...(roof.windows ?? []), { ...window, positionMm: { ...window.positionMm } }];
    return undefined;
  });

/**
 * Moves holes and roof windows on the roof sheet by a plan offset (19.3; the face view converts its slope offsets
 * to plan). Their heights always follow the surface under them; nothing else moves.
 */
export const moveRoofItemsCommand = (
  floorId: string,
  roofId: string,
  ids: readonly string[],
  by: Vec2,
  label: string,
): Command =>
  defineCommand(label, floorId, (draft) => {
    const roof = draftRoof(draft, floorId, roofId);
    if (roof === undefined) return "The roof no longer exists.";
    const moving = new Set(ids);
    const round = (value: number): number => Math.round(value * 1000) / 1000;
    for (const hole of roof.holes ?? [])
      if (moving.has(hole.id))
        hole.points = hole.points.map((point) => ({ x: round(point.x + by.x), y: round(point.y + by.y) }));
    for (const window of roof.windows ?? [])
      if (moving.has(window.id))
        window.positionMm = { x: round(window.positionMm.x + by.x), y: round(window.positionMm.y + by.y) };
    return undefined;
  });
