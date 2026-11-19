// New wall features (wall relief groups): the name, face, and starting material of a feature on a wall.
import { nextFreeName } from "@shared/domain/commands/naming";
import { createId } from "@shared/domain/ids";
import type { ShapeValue } from "@shared/domain/schemas/shapes";
import type { WallReliefValue, WallValue } from "@shared/domain/schemas/wall";

/** A feature holding these shapes (face coordinates), flat by default, starting with the face's material. */
export const createWallFeature = (
  wall: WallValue,
  face: "interior" | "exterior",
  shapes: readonly ShapeValue[],
  depthMm = 0,
): WallReliefValue => ({
  id: createId("wr"),
  name: nextFreeName(
    (wall.reliefs ?? []).map((candidate) => candidate.name),
    "Feature",
  ),
  face,
  depthMm,
  material: structuredClone(wall.materials[face]),
  shapes: structuredClone([...shapes]),
});
