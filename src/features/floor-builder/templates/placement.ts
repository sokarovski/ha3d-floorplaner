// Turns a picked template into an insertion command with the template's default placement (D07).
import type { TemplateListItemValue } from "@shared/contracts/templates";
import {
  addObjectCommand,
  addOpeningCommand,
  defaultAreableHost,
  newAreableInstance,
  newWallableInstance,
} from "@shared/domain/commands/instanceCommands";
import { stairRiseSuggestionMm } from "@shared/domain/house/stairs";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { AreableInstanceValue, WallableInstanceValue } from "@shared/domain/schemas/instances";
import { openingSizeFromParameters } from "@shared/domain/templates/openingSize";
import { fitUnderRoof, wallItemTopLimitMm } from "@shared/geometry/roofItems";
import { defaultInstanceParameters, floorCutParameters } from "@shared/domain/templates/metadata";
import { addRoofWindowCommand } from "@shared/domain/commands/roofCommands";
import { createId } from "@shared/domain/ids";
import { roofWindowSpot } from "@shared/geometry/roofOpenings";
import { roomCentre } from "../services/roomCentre";
import { syntheticRow } from "../services/houseTree";
import { nextFreeName } from "@shared/domain/commands/naming";
import { chooseFixtureCommand } from "@shared/domain/commands/furnishingCommands";
import { indexEntities } from "@shared/domain/house/entityIndex";
import type { TemplateClient } from "../../../api/templateClient";
import { wallLengthOf } from "../services/wallLength";
import type { EditorSession } from "../services/editorSession";
import type { PickerRequest } from "./templatePickerStore";
import { latestVersion, loadTemplateMetadata } from "./templateLibrary";

/** The new opening lowered under the roof, or an error when it cannot fit under it at this place. */
const underRoof = (
  house: HouseDocument,
  floorId: string,
  areaId: string,
  wallId: string,
  opening: WallableInstanceValue,
  label: string,
): WallableInstanceValue => {
  const floor = house.floors.find((candidate) => candidate.id === floorId);
  const size = openingSizeFromParameters(opening);
  if (floor === undefined || size === null) return opening;
  const limit = wallItemTopLimitMm(
    floor,
    areaId,
    wallId,
    opening.placement.distanceAlongWallMm,
    size.widthMm,
  );
  const fit = fitUnderRoof(opening.placement.bottomMm, size.heightMm, limit);
  if (fit.kind === "fits") return opening;
  if (fit.kind === "tooTall")
    throw new Error(`“${label}” is taller than the space under the roof in the middle of this wall.`);
  return { ...opening, placement: { ...opening.placement, bottomMm: fit.bottomMm } };
};

const sizeParameter = (instance: AreableInstanceValue, key: string): number => {
  const value = instance.parameters[key];
  return typeof value === "number" ? value : 0;
};

/** A new wall-mounted object lowered under the roof, or an error when it cannot fit under it at this place. */
const wallObjectUnderRoof = (
  house: HouseDocument,
  floorId: string,
  areaId: string,
  object: AreableInstanceValue,
  label: string,
): AreableInstanceValue => {
  const floor = house.floors.find((candidate) => candidate.id === floorId);
  const wallId = object.attachment.host === "wall" ? object.attachment.wallId : undefined;
  if (floor === undefined || wallId === undefined) return object;
  const limit = wallItemTopLimitMm(
    floor,
    areaId,
    wallId,
    object.positionMm.x,
    sizeParameter(object, "widthMm"),
    [object.attachment.hostSide ?? "interior"],
  );
  const fit = fitUnderRoof(object.elevationMm, sizeParameter(object, "heightMm"), limit);
  if (fit.kind === "fits") return object;
  if (fit.kind === "tooTall")
    throw new Error(`“${label}” is taller than the space under the roof in the middle of this wall.`);
  return { ...object, elevationMm: fit.bottomMm };
};

export const placeTemplate = async (
  session: EditorSession,
  client: TemplateClient,
  request: PickerRequest,
  item: TemplateListItemValue,
): Promise<void> => {
  const version = latestVersion(item);
  const metadata = await loadTemplateMetadata(client, session.houseId, item, version);
  if (metadata === undefined) throw new Error(`“${item.label}” has invalid template metadata.`);
  const choice = { templateId: item.id, version, label: item.label, metadata };
  const house = session.documents.getState().document;
  const entities = indexEntities(house);
  if (request.kind === "opening") {
    const wall = entities.get(request.wallId);
    if (wall?.kind !== "wall") throw new Error("The wall no longer exists.");
    const names = wall.value.objects.map((opening) => opening.name);
    const created = newWallableInstance(
      choice,
      nextFreeName(names, item.label),
      wallLengthOf(house, wall.areaId, wall.value) / 2,
    );
    // The window limit (Phase 19.2): under a roof the opening is lowered until its top is under the underside
    // along its whole width; one too tall for the roof there is refused.
    const instance = underRoof(house, wall.floorId, wall.areaId, wall.id, created, item.label);
    if (!session.execute(addOpeningCommand(wall.floorId, wall.areaId, wall.id, instance)).ok)
      throw new Error("The opening could not be placed.");
    if (instance.placement.bottomMm !== created.placement.bottomMm)
      session.notify("info", `${instance.name} was lowered to fit under the roof.`);
    session.ui.setState({ selection: [instance.id] });
    return;
  }
  if (request.kind === "object") {
    const area = entities.get(request.areaId);
    if (area?.kind !== "area") throw new Error("The area no longer exists.");
    // The template's first listed host that the area offers (Phase 9.1): ["wall", "floor"] mounts on the
    // area's first wall when it has one, else stands on the floor; ["floor", "wall"] stands on the floor.
    const firstWall = area.value.walls[0];
    const host = defaultAreableHost(metadata.attachment.hosts, firstWall !== undefined);
    if (host === "wall" && firstWall === undefined)
      throw new Error("This object mounts on a wall; raise a wall in the area first.");
    const wallId = host === "wall" ? firstWall?.id : undefined;
    const created = newAreableInstance(
      choice,
      nextFreeName(
        area.value.objects.map((object) => object.name),
        item.label,
      ),
      // A wall-mounted object starts in the middle of its wall.
      {
        x: firstWall === undefined || wallId === undefined ? 0 : wallLengthOf(house, area.id, firstWall) / 2,
        y: 0,
      },
      wallId,
    );
    // Wall-mounted objects stop under the roof like doors and windows (Phase 19.5): lowered until the top is
    // under the underside over its width on its face, refused when it cannot fit.
    const instance = wallObjectUnderRoof(house, area.floorId, area.id, created, item.label);
    if (!session.execute(addObjectCommand(area.floorId, area.id, instance)).ok)
      throw new Error("The object could not be placed.");
    if (instance.elevationMm !== created.elevationMm)
      session.notify("info", `${instance.name} was lowered to fit under the roof.`);
    session.ui.setState({ selection: [instance.id] });
    return;
  }
  if (request.kind === "staircase" || request.kind === "floorOpening") {
    // Stairs and floor openings (Phase 16.14): at the room's centre with the template's default size; a stair's
    // rise is the gap to the next floor above (a one-time suggestion, within the template's limits).
    const area = entities.get(request.areaId);
    if (area?.kind !== "area") throw new Error("The area no longer exists.");
    const created = newAreableInstance(
      choice,
      nextFreeName(
        area.value.objects.map((object) => object.name),
        item.label,
      ),
      roomCentre(area.value),
      undefined,
    );
    const rise = metadata.resize.y;
    const defaultRise = created.parameters[floorCutParameters.y];
    const instance =
      created.floorCut === "stair"
        ? {
            ...created,
            parameters: {
              ...created.parameters,
              [floorCutParameters.y]: stairRiseSuggestionMm(
                house,
                area.floorId,
                {
                  ...("minMm" in rise && rise.minMm !== undefined ? { minMm: rise.minMm } : {}),
                  ...("maxMm" in rise && rise.maxMm !== undefined ? { maxMm: rise.maxMm } : {}),
                },
                typeof defaultRise === "number" ? defaultRise : 2700,
              ),
            },
          }
        : created;
    if (!session.execute(addObjectCommand(area.floorId, area.id, instance)).ok)
      throw new Error(`“${item.label}” could not be placed.`);
    session.ui.setState((state) => ({
      selection: [instance.id],
      expanded: [...state.expanded, area.id, syntheticRow.objects(area.id)],
    }));
    return;
  }
  if (request.kind === "roofWindow") {
    // A roof window (Phase 19.3): the template's default size and pitch limits, centred where the face was clicked
    // or on the roof's best face; stored on the roof sheet.
    const roof = entities.get(request.roofId);
    if (roof?.kind !== "roof") throw new Error("The roof no longer exists.");
    const limits = metadata.roofWindow;
    if (limits === undefined) throw new Error(`“${item.label}” is not a roof window.`);
    const at = request.at ?? roofWindowSpot(roof.value, limits.minPitchDeg, limits.maxPitchDeg);
    if (at === null) throw new Error("The roof has no face for a roof window.");
    const parameters = defaultInstanceParameters(metadata);
    const size = (name: string, fallback: number): number => {
      const value = parameters[name];
      return typeof value === "number" ? value : fallback;
    };
    const window = {
      id: createId("rw"),
      name: nextFreeName(
        (roof.value.windows ?? []).map((candidate) => candidate.name),
        item.label,
      ),
      templateId: item.id,
      templateVersion: version,
      positionMm: { x: Math.round(at.x), y: Math.round(at.y) },
      widthMm: size("widthMm", 780),
      lengthMm: size("heightMm", 1180),
      minPitchDeg: limits.minPitchDeg,
      maxPitchDeg: limits.maxPitchDeg,
    };
    if (!session.execute(addRoofWindowCommand(request.floorId, roof.id, window)).ok)
      throw new Error(`“${item.label}” could not be placed.`);
    session.ui.setState((state) => ({
      selection: [window.id],
      expanded: [...state.expanded, request.floorId, roof.id],
    }));
    return;
  }
  const light = entities.get(request.lightId);
  if (light?.kind !== "light") throw new Error("The light no longer exists.");
  // A wall-only fixture (Phase 17.3: outdoor wall lights) mounts the light on the nearest wall as well.
  const hosts = metadata.attachment.hosts;
  const wallOnly =
    hosts.length === 1 && hosts[0] === "wall" ? { side: metadata.attachment.defaultHostSide } : null;
  if (
    !session.execute(
      chooseFixtureCommand(
        light.floorId,
        light.areaId,
        light.id,
        { templateId: item.id, templateVersion: version },
        wallOnly,
      ),
    ).ok
  )
    throw new Error("The fixture could not be set.");
};
