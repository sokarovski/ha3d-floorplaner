// Whole-document integrity (spec/builder/model.md#document-tree-ids-and-the-entity-index): every `id` in house.json
// is unique across the document, and the references the JSON Schema cannot check point at the right things.
// Tolerated by design: a wall-mounted light or object, or a wall, whose wall or source shape was deleted (it falls
// back to its stored position, or becomes an orphan wall). Refused: a reference into another area, group members
// that are not in the group's area (object groups) or floor (light groups), and duplicate IDs.
import type { ValidationIssue } from "../validation/ajv";
import type { AreaValue } from "../schemas/area";
import type { HouseDocument } from "../schemas/house";

const pointerToken = (token: string | number): string =>
  String(token).replaceAll("~", "~0").replaceAll("/", "~1");

/** Every `id` string held by an object anywhere in `value`, with its JSON Pointer (document order). */
export const collectIds = (
  value: unknown,
  pointer = "",
): readonly Readonly<{ id: string; pointer: string }>[] => {
  const found: { id: string; pointer: string }[] = [];
  const walk = (node: unknown, at: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item: unknown, index: number) => {
        walk(item, `${at}/${String(index)}`);
      });
      return;
    }
    if (typeof node !== "object" || node === null) return;
    const entries: [string, unknown][] = Object.entries(node);
    for (const [key, child] of entries) {
      if (key === "id" && typeof child === "string") found.push({ id: child, pointer: `${at}/id` });
      else walk(child, `${at}/${pointerToken(key)}`);
    }
  };
  walk(value, pointer);
  return found;
};

const areaWallIds = (area: AreaValue): ReadonlySet<string> => new Set(area.walls.map((wall) => wall.id));

/**
 * Integrity problems of a house document, each with a pointer and a message naming the IDs involved (the message is
 * stable when unrelated items move, so callers can tell new problems from ones a document already had).
 */
export const documentIntegrityProblems = (house: HouseDocument): readonly ValidationIssue[] => {
  const problems: ValidationIssue[] = [];
  const seen = new Set<string>();
  for (const { id, pointer } of collectIds(house)) {
    if (seen.has(id)) problems.push({ pointer, message: `ID ${id} is used more than once` });
    seen.add(id);
  }
  const allWalls = new Set(
    house.floors.flatMap((floor) => floor.areas.flatMap((area) => [...areaWallIds(area)])),
  );
  const allShapes = new Set(
    house.floors.flatMap((floor) =>
      floor.areas.flatMap((area) => area.floor.shapes.map((shape) => shape.id)),
    ),
  );
  house.floors.forEach((floor, f) => {
    const floorAt = `/floors/${String(f)}`;
    const floorLights = new Set(floor.areas.flatMap((area) => area.lights.map((light) => light.id)));
    floor.lightGroups.forEach((group, g) => {
      for (const member of group.memberIds)
        if (!floorLights.has(member))
          problems.push({
            pointer: `${floorAt}/lightGroups/${String(g)}/memberIds`,
            message: `Light group ${group.id} lists ${member}, which is not a light on its floor`,
          });
    });
    floor.areas.forEach((area, a) => {
      const areaAt = `${floorAt}/areas/${String(a)}`;
      const walls = areaWallIds(area);
      const shapes = new Set(area.floor.shapes.map((shape) => shape.id));
      const groupable = new Set(
        [...area.objects, ...area.lights, ...area.floor.carpets].map((item) => item.id),
      );
      (area.objectGroups ?? []).forEach((group, g) => {
        for (const member of group.memberIds)
          if (!groupable.has(member))
            problems.push({
              pointer: `${areaAt}/objectGroups/${String(g)}/memberIds`,
              message: `Object group ${group.id} lists ${member}, which is not an object, light or carpet of its area`,
            });
      });
      const foreignWall = (wallId: string | undefined, pointer: string, owner: string): void => {
        if (wallId !== undefined && !walls.has(wallId) && allWalls.has(wallId))
          problems.push({ pointer, message: `${owner} refers to wall ${wallId} of another area` });
      };
      area.objects.forEach((object, o) => {
        foreignWall(
          object.attachment.wallId,
          `${areaAt}/objects/${String(o)}/attachment/wallId`,
          `Object ${object.id}`,
        );
      });
      area.lights.forEach((light, l) => {
        foreignWall(light.wallId, `${areaAt}/lights/${String(l)}/wallId`, `Light ${light.id}`);
      });
      area.walls.forEach((wall, w) => {
        const shapeId = wall.sourceEdge.shapeId;
        if (!shapes.has(shapeId) && allShapes.has(shapeId))
          problems.push({
            pointer: `${areaAt}/walls/${String(w)}/sourceEdge/shapeId`,
            message: `Wall ${wall.id} stands on shape ${shapeId} of another area`,
          });
      });
    });
  });
  return problems;
};

/** The problems of `next` that `previous` did not already have (so an edit never fails over an inherited fault). */
export const newIntegrityProblems = (
  next: HouseDocument,
  previous: HouseDocument | undefined,
): readonly ValidationIssue[] => {
  const problems = documentIntegrityProblems(next);
  if (previous === undefined || problems.length === 0) return problems;
  const known = new Set(documentIntegrityProblems(previous).map((problem) => problem.message));
  return problems.filter((problem) => !known.has(problem.message));
};
