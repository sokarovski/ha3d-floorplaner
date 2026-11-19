// Add-menu handlers for openings, objects, lights, carpets, and light groups; template version updates.
import {
  addCarpetCommand,
  addLightCommand,
  addLightGroupCommand,
  createLight,
} from "@shared/domain/commands/furnishingCommands";
import { nextFreeName } from "@shared/domain/commands/naming";
import { addPathwayCommand } from "@shared/domain/commands/areaCommands";
import { updateTemplateVersionCommand } from "@shared/domain/commands/instanceCommands";
import { effectiveWallHeightMm } from "@shared/domain/house/defaults";
import { indexEntities } from "@shared/domain/house/entityIndex";
import { addReliefCommand } from "@shared/domain/commands/wallCommands";
import { createId } from "@shared/domain/ids";
import { computeAreaFloorGeometry } from "@shared/geometry/areaGeometry";
import { pickerStore } from "../templates/templatePickerStore";
import type { OpeningFilter } from "../templates/templatePickerStore";
import { registerAddHandler } from "./addHandlers";
import { createWallFeature } from "./wallFeature";
import { enterWallFeature } from "./treeActions";
import { registerTemplateVersionUpdater } from "./templateVersions";
import { ownerId } from "../domain-editors/ownerFields";
import { enterHouseOverview } from "./editContext";
import { addCanopyCommand, addRoofCommand } from "@shared/domain/commands/roofCommands";
import { addEffectToObject } from "./effectActions";
import { roomCentre } from "./roomCentre";

/** The opening pickers: doors and windows on room walls, gates on a yard's fences (Phase 17.2). */
const openingFilters: readonly OpeningFilter[] = ["door", "window", "gate"];

export const registerFurnishing = (): void => {
  for (const filter of openingFilters) {
    registerAddHandler(`add:${filter}`, (session, rowId) => {
      const wall = indexEntities(session.documents.getState().document).get(rowId);
      if (wall?.kind === "wall")
        pickerStore.setState({ request: { kind: "opening", filter, areaId: wall.areaId, wallId: wall.id } });
    });
  }
  registerAddHandler("add:object", (_session, rowId) => {
    pickerStore.setState({ request: { kind: "object", areaId: rowId } });
  });
  // Stairs and floor openings (Phase 16.14): a picker of those templates; the choice lands at the room's centre.
  registerAddHandler("add:staircase", (_session, rowId) => {
    pickerStore.setState({ request: { kind: "staircase", areaId: rowId } });
  });
  registerAddHandler("add:floorOpening", (_session, rowId) => {
    pickerStore.setState({ request: { kind: "floorOpening", areaId: rowId } });
  });
  // Add roof (Phase 19.1): a flat roof over the top floor's bounding box + 400 mm, selected in the whole house (where
  // roofs are seen); a double-click there opens it.
  registerAddHandler("add:roof", (session, rowId) => {
    const added = addRoofCommand(session.documents.getState().document, rowId);
    if ("message" in added) {
      session.notify("info", added.message);
      return;
    }
    if (!session.execute(added.command).ok) return;
    enterHouseOverview(session, [added.roofId]);
    session.ui.setState((state) => ({ expanded: [...new Set([...state.expanded, rowId])] }));
    session.notify("info", "Roof added. Double-click it to draw break lines and pull its points.");
  });
  // Add canopy (Phase 19.3): an attached roof (it cuts nothing) over the row's room or yard, or at the floor's
  // centre; drawn in the floor's views too, selected there. A double-click opens it to move or reshape it.
  registerAddHandler("add:canopy", (session, rowId) => {
    const house = session.documents.getState().document;
    const ref = indexEntities(house).get(rowId);
    const floorId = ref?.kind === "floor" ? ref.id : ref?.kind === "area" ? ref.floorId : undefined;
    if (floorId === undefined) return;
    const added = addCanopyCommand(house, floorId, ref?.kind === "area" ? ref.id : undefined);
    if ("message" in added) {
      session.notify("info", added.message);
      return;
    }
    if (!session.execute(added.command).ok) return;
    session.ui.setState((state) => ({
      selection: [added.roofId],
      expanded: [...new Set([...state.expanded, floorId])],
    }));
    session.notify("info", "Canopy added. Double-click it to move it (Move, typed values) or reshape it.");
  });
  // Roof window… (Phase 19.3): the roof-window picker; the choice lands on the roof's best face.
  registerAddHandler("add:roofWindow", (session, rowId) => {
    const ref = indexEntities(session.documents.getState().document).get(rowId);
    if (ref?.kind === "roof")
      pickerStore.setState({ request: { kind: "roofWindow", floorId: ref.floorId, roofId: ref.id } });
  });
  registerAddHandler("add:light", (session, rowId) => {
    const area = indexEntities(session.documents.getState().document).get(rowId);
    if (area?.kind !== "area") return;
    // A new light starts at the room's centre just under its walls (Phase 5.12), then follows the pointer
    // until a click places it; Escape leaves it at the centre.
    const house = session.documents.getState().document;
    const wallTop = Math.max(0, ...area.value.walls.map((wall) => wall.heightMm));
    const created = createLight(
      nextFreeName(
        area.value.lights.map((candidate) => candidate.name),
        "Light",
      ),
      roomCentre(area.value),
    );
    const light = {
      ...created,
      elevationMm: Math.max(0, (wallTop > 0 ? wallTop : effectiveWallHeightMm(house)) - 100),
    };
    if (session.execute(addLightCommand(area.floorId, area.id, light)).ok)
      session.ui.setState((state) => ({
        selection: [light.id],
        tool: "select",
        placingLightId: light.id,
        expanded: [...state.expanded, area.id, `row:lights:${area.id}`],
      }));
  });
  // Wall features (wall relief groups): a 600 × 600 mm square, centred along the wall, 900 mm up (or centred
  // on a low wall), flat, on the room-facing face and starting with that face's material. It opens for editing
  // so shapes can be added to it with the shape tools.
  registerAddHandler("add:wallFeature", (session, wallId) => {
    const ref = indexEntities(session.documents.getState().document).get(wallId);
    if (ref?.kind !== "wall") return;
    const area = indexEntities(session.documents.getState().document).get(ref.areaId);
    if (area?.kind !== "area") return;
    const real = computeAreaFloorGeometry(area.value).realWalls.find((wall) => wall.wallId === wallId);
    const span = real === undefined ? 0 : real.spanMm.toMm - real.spanMm.fromMm;
    const width = Math.max(1, Math.min(600, span));
    const height = Math.max(1, Math.min(600, ref.value.heightMm));
    const bottom = ref.value.heightMm >= 1500 ? 900 : Math.max(0, (ref.value.heightMm - height) / 2);
    const feature = createWallFeature(ref.value, "interior", [
      {
        id: createId("s"),
        type: "rectangle",
        positionMm: {
          x: Math.round(Math.max(0, span / 2)),
          y: Math.round(bottom + height / 2),
        },
        rotationDeg: 0,
        widthMm: Math.round(width),
        heightMm: Math.round(height),
      },
    ]);
    if (session.execute(addReliefCommand(ref.floorId, ref.areaId, wallId, feature)).ok)
      enterWallFeature(session, feature.id);
  });
  registerAddHandler("add:effect", (session, rowId) => {
    addEffectToObject(session, rowId);
  });
  registerAddHandler("add:carpet", (session, rowId) => {
    const surface = indexEntities(session.documents.getState().document).get(rowId);
    if (surface?.kind !== "floorSurface") return;
    const { command, carpetId } = addCarpetCommand(
      session.documents.getState().document,
      surface.floorId,
      surface.areaId,
      { x: 0, y: 0 },
    );
    if (session.execute(command).ok)
      session.ui.setState((state) => ({
        selection: [carpetId],
        expanded: [...state.expanded, surface.areaId, surface.id],
      }));
  });
  // Pathways (Phase 17.2): carpets of built-in Paving in a yard, at its centre.
  registerAddHandler("add:pathway", (session, rowId) => {
    const surface = indexEntities(session.documents.getState().document).get(rowId);
    if (surface?.kind !== "floorSurface") return;
    const { command, carpetId } = addPathwayCommand(
      session.documents.getState().document,
      surface.floorId,
      surface.areaId,
      { x: 0, y: 0 },
    );
    if (session.execute(command).ok)
      session.ui.setState((state) => ({
        selection: [carpetId],
        expanded: [...state.expanded, surface.areaId, surface.id],
      }));
  });
  registerAddHandler("add:lightGroup", (session, rowId) => {
    const house = session.documents.getState().document;
    const entities = indexEntities(house);
    const members = session.ui.getState().selection.filter((id) => {
      const ref = entities.get(id);
      return ref?.kind === "light" && ref.floorId === rowId;
    });
    const { command, groupId } = addLightGroupCommand(house, rowId, members);
    if (session.execute(command).ok)
      session.ui.setState((state) => ({
        selection: [groupId],
        expanded: [...state.expanded, rowId, `row:lightGroups:${rowId}`],
      }));
  });
  registerTemplateVersionUpdater((session, owner, version) => {
    const id = ownerId(owner);
    if (id === undefined) return false;
    return session.execute(
      updateTemplateVersionCommand(session.ui.getState().activeFloorId, new Set([id]), version),
    ).ok;
  });
};
