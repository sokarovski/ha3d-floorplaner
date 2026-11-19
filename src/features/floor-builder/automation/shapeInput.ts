import Type from "typebox";
import type { Static } from "typebox";
import { createId } from "@shared/domain/ids";
import type { ShapeValue } from "@shared/domain/schemas/shapes";
import { validatePolygonPoints } from "@shared/geometry/polygonValidation";
import { AgentError } from "./automationTypes";

export const PointInput = Type.Object(
  { x: Type.Number(), y: Type.Number() },
  { additionalProperties: false },
);
export const NameInput = Type.String({ minLength: 1, maxLength: 64, pattern: "\\S" });
export const EntityIdInput = Type.String({ minLength: 1 });
export const ShapeInput = Type.Union([
  Type.Object(
    {
      type: Type.Literal("rectangle"),
      positionMm: PointInput,
      rotationDeg: Type.Number(),
      widthMm: Type.Number({ exclusiveMinimum: 0, maximum: 200000 }),
      depthMm: Type.Number({ exclusiveMinimum: 0, maximum: 200000 }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal("circle"),
      positionMm: PointInput,
      radiusMm: Type.Number({ exclusiveMinimum: 0, maximum: 100000 }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal("polygon"),
      positionMm: PointInput,
      rotationDeg: Type.Number(),
      vertices: Type.Array(PointInput, { minItems: 3, maxItems: 1000 }),
    },
    { additionalProperties: false },
  ),
]);

export const makeShape = (input: Static<typeof ShapeInput>, id = createId("s")): ShapeValue => {
  if (input.type === "rectangle")
    return {
      id,
      type: "rectangle",
      positionMm: { ...input.positionMm },
      rotationDeg: input.rotationDeg,
      widthMm: input.widthMm,
      heightMm: input.depthMm,
    };
  if (input.type === "circle") return { id, ...input, positionMm: { ...input.positionMm } };
  if (!validatePolygonPoints(input.vertices).valid)
    throw new AgentError("INVALID_INPUT", "A polygon must have a nonzero area and no crossing edges.");
  const area = input.vertices.reduce((sum, point, i) => {
    const next = input.vertices[(i + 1) % input.vertices.length];
    return sum + (next === undefined ? 0 : point.x * next.y - next.x * point.y);
  }, 0);
  const vertices = area < 0 ? [...input.vertices].reverse() : input.vertices;
  return {
    id,
    type: "polygon",
    positionMm: { ...input.positionMm },
    rotationDeg: input.rotationDeg,
    vertices: vertices.map((point) => ({ id: createId("v"), ...point })),
  };
};
