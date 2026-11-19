// RealAllWalls mesh assembly: vertical faces per slice edge, horizontal caps where the footprint changes
// between slices (wall tops, stepped tops, sills, lintel undersides), grouped by material owner.
// UVs are physical mm: on vertical faces u runs to the right seen from outside the face and v = h; wall
// sides measure u from the owning wall's source-edge start so tiling stays continuous across splits.
// The floor's roof in Cuts walls mode clips the result (Phase 19.2, roofClip.ts): per roof piece and only over its
// plan region, vertical faces are trimmed to min(top, H), horizontal faces survive only where H is above them, each
// slice gets sloped cap pieces (cap material) where bottom < H ≤ top, and where the roof's outline crosses the walls
// the uncovered part shows a vertical step face (cap material) above the underside.
import type { MeshAccumulator } from "./meshData";
import { createMeshAccumulator, pushVertex, toMeshBuffers } from "./meshData";
import { differenceRegions } from "./polygonKernel";
import type { Region } from "./region";
import type { FaceSpan } from "./roofClip";
import { clipFaceSpans, regionsUnderRoof, slopedCapRegions, stepFaces } from "./roofClip";
import type { Linear2, RoofLimit } from "./roofLimit";
import { evaluateLinear } from "./roofLimit";
import type {
  ClassifiedEdge,
  HeightSlice,
  RealAllWallsMesh,
  WallMaterialOwner,
  WallMeshGroup,
} from "./realAllWallsTypes";
import { heightToleranceMm } from "./tolerances";
import { triangulateRegion } from "./triangulate";
import type { Vec2 } from "./vector";
import { dotVec, lerpVec, normalizeVec, rightNormal, subVec } from "./vector";
import type { RealWall, WallFaceRef } from "./wallBands";

type Triangle = Readonly<{
  materialKey: string;
  material: WallMaterialOwner;
  face: number;
  a: number;
  b: number;
  c: number;
}>;

const capMaterial: WallMaterialOwner = { kind: "cap" };
const capKey = "cap";

const materialOf = (owner: WallFaceRef | null): { key: string; material: WallMaterialOwner } => {
  if (owner === null || owner.side === "end") return { key: capKey, material: capMaterial };
  // A box's or niche's sides use the relief's material (Phase 5.0); horizontal faces stay caps.
  const relief = owner.reliefId === undefined ? "" : `:${owner.reliefId}`;
  return {
    key: `wall:${owner.wallId}:${owner.side}${relief}`,
    material: {
      kind: "wallSide",
      wallId: owner.wallId,
      areaId: owner.areaId,
      side: owner.side,
      ...(owner.reliefId === undefined ? {} : { reliefId: owner.reliefId }),
    },
  };
};

type Builder = Readonly<{
  mesh: MeshAccumulator;
  triangles: Triangle[];
  faceRefs: WallFaceRef[];
  faceIndex: Map<string, number>;
}>;

const faceRefIndex = (builder: Builder, ref: WallFaceRef | null): number => {
  if (ref === null) return -1;
  const key = `${ref.wallId}:${ref.side}:${ref.reliefId ?? ""}`;
  const existing = builder.faceIndex.get(key);
  if (existing !== undefined) return existing;
  builder.faceRefs.push(ref);
  builder.faceIndex.set(key, builder.faceRefs.length - 1);
  return builder.faceRefs.length - 1;
};

const addVerticalFace = (
  builder: Builder,
  edge: ClassifiedEdge,
  bottomMm: number,
  topMm: number,
  wallsById: ReadonlyMap<string, RealWall>,
  limit: RoofLimit | null,
): void => {
  const direction = normalizeVec(subVec(edge.end, edge.start));
  const normal = rightNormal(direction);
  const tangent: Vec2 = { x: -normal.y, y: normal.x };
  const wall = edge.owner === null ? undefined : wallsById.get(edge.owner.wallId);
  const origin =
    edge.owner !== null && edge.owner.side !== "end" && wall !== undefined ? wall.edge.start : { x: 0, y: 0 };
  const u = (point: Vec2): number => dotVec(subVec(point, origin), tangent);
  const n = { x: normal.x, y: normal.y, h: 0 };
  const vertex = (point: Vec2, h: number): number =>
    pushVertex(builder.mesh, { x: point.x, y: point.y, h }, n, { x: u(point), y: h });
  const { key, material } = materialOf(edge.owner);
  const face = faceRefIndex(builder, edge.owner);
  const spans: readonly FaceSpan[] = clipFaceSpans(edge.start, edge.end, bottomMm, topMm, limit);
  for (const span of spans) {
    const pa = lerpVec(edge.start, edge.end, span.t0);
    const pb = lerpVec(edge.start, edge.end, span.t1);
    const a0 = vertex(pa, bottomMm);
    const b0 = vertex(pb, bottomMm);
    const b1 = vertex(pb, span.top1);
    const a1 = vertex(pa, span.top0);
    if (span.top1 > bottomMm + heightToleranceMm)
      builder.triangles.push({ materialKey: key, material, face, a: a0, b: b0, c: b1 });
    if (span.top0 > bottomMm + heightToleranceMm)
      builder.triangles.push({ materialKey: key, material, face, a: a0, b: b1, c: a1 });
  }
};

/** Step faces where the roof's outline or a step line (19.5) crosses the walls (cap material, no owning face). */
const addStepFaces = (
  builder: Builder,
  footprint: Region,
  limit: RoofLimit | null,
  bottomMm: number,
  topMm: number,
): void => {
  for (const step of stepFaces(footprint, limit, bottomMm, topMm)) {
    const direction = normalizeVec(subVec(step.end, step.start));
    const normal = rightNormal(direction);
    const tangent: Vec2 = { x: -normal.y, y: normal.x };
    const n = { x: normal.x, y: normal.y, h: 0 };
    const vertex = (point: Vec2, h: number): number =>
      pushVertex(builder.mesh, { x: point.x, y: point.y, h }, n, { x: dotVec(point, tangent), y: h });
    for (const span of step.spans) {
      const pa = lerpVec(step.start, step.end, span.t0);
      const pb = lerpVec(step.start, step.end, span.t1);
      const a0 = vertex(pa, span.low0);
      const b0 = vertex(pb, span.low1);
      const b1 = vertex(pb, span.high1);
      const a1 = vertex(pa, span.high0);
      if (span.low1 < span.high1 - heightToleranceMm)
        builder.triangles.push({ materialKey: capKey, material: capMaterial, face: -1, a: a0, b: b0, c: b1 });
      if (span.low0 < span.high0 - heightToleranceMm)
        builder.triangles.push({ materialKey: capKey, material: capMaterial, face: -1, a: a0, b: b1, c: a1 });
    }
  }
};

const addHorizontalRegion = (builder: Builder, region: Region, heightMm: number, facingUp: boolean): void => {
  if (region.polygons.length === 0) return;
  const triangulation = triangulateRegion(region);
  const normal = { x: 0, y: 0, h: facingUp ? 1 : -1 };
  const indices = triangulation.vertices.map((vertex) =>
    pushVertex(builder.mesh, { x: vertex.x, y: vertex.y, h: heightMm }, normal, vertex),
  );
  for (let index = 0; index + 2 < triangulation.indices.length; index += 3) {
    const a = indices[triangulation.indices[index] ?? -1];
    const b = indices[triangulation.indices[index + 1] ?? -1];
    const c = indices[triangulation.indices[index + 2] ?? -1];
    if (a === undefined || b === undefined || c === undefined) continue;
    builder.triangles.push(
      facingUp
        ? { materialKey: capKey, material: capMaterial, face: -1, a, b, c }
        : { materialKey: capKey, material: capMaterial, face: -1, a, b: c, c: b },
    );
  }
};

/** A sloped cap under the roof: the region lifted onto its piece's plane (cap material, no owning face). */
const addSlopedRegion = (builder: Builder, region: Region, plane: Linear2): void => {
  const triangulation = triangulateRegion(region);
  const { ax, ay } = plane;
  const length = Math.hypot(ax, ay, 1);
  const normal = { x: -ax / length, y: -ay / length, h: 1 / length };
  const indices = triangulation.vertices.map((vertex) =>
    pushVertex(builder.mesh, { x: vertex.x, y: vertex.y, h: evaluateLinear(plane, vertex) }, normal, vertex),
  );
  for (let index = 0; index + 2 < triangulation.indices.length; index += 3) {
    const a = indices[triangulation.indices[index] ?? -1];
    const b = indices[triangulation.indices[index + 1] ?? -1];
    const c = indices[triangulation.indices[index + 2] ?? -1];
    if (a === undefined || b === undefined || c === undefined) continue;
    builder.triangles.push({ materialKey: capKey, material: capMaterial, face: -1, a, b, c });
  }
};

const emptyFootprint: Region = { polygons: [] };

/** Drops the roof when its underside stays above every wall top (a plane's minimum over its region is at a vertex). */
const effectiveLimit = (limit: RoofLimit | null, maxTopMm: number): RoofLimit | null => {
  if (limit === null) return null;
  const lowest = Math.min(
    ...limit.pieces.flatMap((piece) =>
      piece.region.polygons.flatMap((polygon) =>
        polygon.outer.map((point) => evaluateLinear(piece.plane, point)),
      ),
    ),
  );
  return lowest > maxTopMm + heightToleranceMm ? null : limit;
};

export const buildRealAllWallsMesh = (
  slices: readonly HeightSlice[],
  wallsById: ReadonlyMap<string, RealWall>,
  roofLimit: RoofLimit | null = null,
): RealAllWallsMesh => {
  const limit = effectiveLimit(roofLimit, Math.max(0, ...slices.map((slice) => slice.topMm)));
  const addCaps = (region: Region, heightMm: number, facingUp: boolean): void => {
    for (const part of regionsUnderRoof(region, limit, heightMm))
      addHorizontalRegion(builder, part, heightMm, facingUp);
  };
  const builder: Builder = {
    mesh: createMeshAccumulator(),
    triangles: [],
    faceRefs: [],
    faceIndex: new Map(),
  };
  slices.forEach((slice, index) => {
    for (const edge of slice.edges)
      addVerticalFace(builder, edge, slice.bottomMm, slice.topMm, wallsById, limit);
    for (const piece of slopedCapRegions(slice.footprint, limit, slice.bottomMm, slice.topMm))
      addSlopedRegion(builder, piece.region, piece.piece.plane);
    addStepFaces(builder, slice.footprint, limit, slice.bottomMm, slice.topMm);
    const previous = slices[index - 1];
    const below =
      previous !== undefined && Math.abs(previous.topMm - slice.bottomMm) <= heightToleranceMm
        ? previous.footprint
        : emptyFootprint;
    addCaps(differenceRegions(below, slice.footprint), slice.bottomMm, true);
    if (slice.bottomMm > heightToleranceMm)
      addCaps(differenceRegions(slice.footprint, below), slice.bottomMm, false);
    const next = slices[index + 1];
    if (next === undefined || Math.abs(next.bottomMm - slice.topMm) > heightToleranceMm)
      addCaps(slice.footprint, slice.topMm, true);
  });

  const order = new Map<string, Triangle[]>();
  for (const triangle of builder.triangles) {
    const list = order.get(triangle.materialKey) ?? [];
    list.push(triangle);
    order.set(triangle.materialKey, list);
  }
  const keys = [...order.keys()].sort((a, b) => (a === capKey ? 1 : b === capKey ? -1 : a.localeCompare(b)));
  const groups: WallMeshGroup[] = [];
  const triangleFaces: number[] = [];
  for (const key of keys) {
    const list = order.get(key) ?? [];
    const first = list[0];
    if (first === undefined) continue;
    groups.push({ material: first.material, start: builder.mesh.indices.length, count: list.length * 3 });
    for (const triangle of list) {
      builder.mesh.indices.push(triangle.a, triangle.b, triangle.c);
      triangleFaces.push(triangle.face);
    }
  }
  return {
    ...toMeshBuffers(builder.mesh),
    groups,
    triangleFaces: Int32Array.from(triangleFaces),
    faceRefs: builder.faceRefs,
  };
};
