// Roof surface (Phase 19.1, spec/builder/features/roofs.md#derived-geometry): the faces of a roof sheet and their
// planar pieces, derived from the authored points, outline and break lines and never stored. Pure and
// framework-free (the builder, the HA viewer and the checks share it).
//
// 1. Planar subdivision. The outline edges and the break lines form a plan graph on the roof points. For safety the
//    graph splits an edge at any point lying on it and at any crossing the editing commands did not already split
//    (a crossing gets a derived node whose height follows the first line). Lines outside the outline, lines not
//    connected to the outline, and dangling chains (a line end that meets nothing) do not split a face: they are
//    reported as `looseLineIds` (SketchUp: a stray edge does not divide a face). Faces are the bounded cycles of the
//    graph (half-edge walk, counterclockwise in plan).
// 2. Heights. Every face is lifted by its points' heights (above the eave height). A face with three points, or whose
//    points lie on one plane within `planarToleranceMm`, is one planar piece.
// 3. Auto-fold (SketchUp's folding of a face that stops being flat). A non-planar face is triangulated in plan by
//    ear clipping, always cutting the ear whose new diagonal is the shortest in 3D (ties: the lowest vertex index),
//    so a quad folds along its shorter 3D diagonal. Triangles that share a diagonal and stay on one plane merge back
//    into one piece; the diagonals left between pieces are the face's visible fold lines (`folds`). Deterministic:
//    the same sheet always folds the same way; drawing a break line instead replaces the fold.
// 4. Step lines (Phase 19.3). A line of kind "step" has two heights: its raised side (left or right of a → b) is
//    `stepMm` higher along it. Around every node on a step, the faces meeting there are taken in angular order: the
//    face on the raised side gets the step, and so does every face reached from it across ordinary lines until
//    another step or the outline's outside; their corner at that node is lifted by the step. The rest of each side
//    keeps its own point heights (a flat sheet with one step makes the raised side slope back to its eave; pull its
//    far points up for a level upper part). A step ending inside the roof dies out there (both sides meet at the
//    end); a step from the outline to the outline keeps its height. Steps are not break lines for ribs; each gives a
//    vertical face (`steps`) between its two sides.
import { DraftSafeWeakMap } from "./draftSafeWeakMap";
import type { RoofLineValue, RoofPointValue, RoofValue } from "../domain/schemas/roof";
import type { Vec3 } from "./meshData";
import { pointInRing, ringSignedArea } from "./region";
import type { Ring } from "./region";
import type { Vec2 } from "./vector";

/** Points closer than this to a plane count as on it (implementation convention, mm). */
export const planarToleranceMm = 1;
/** A point closer than this to an edge lies on it (mm). */
export const roofOnEdgeToleranceMm = 0.5;

export type RoofSheet = Pick<RoofValue, "points" | "outline" | "lines">;

/** A plane over the plan: h = c + ax·x + ay·y (heights relative to the eave). */
export type RoofPlane = Readonly<{ c: number; ax: number; ay: number }>;

export type RoofTriangle = readonly [Vec3, Vec3, Vec3];

/** A planar piece of a face: its triangles (counterclockwise in plan) and their plane. */
export type RoofPiece = Readonly<{ faceIndex: number; plane: RoofPlane; triangles: readonly RoofTriangle[] }>;

/** A face between break lines: its plan ring (CCW) with node IDs and heights. */
export type RoofFace = Readonly<{
  nodeIds: readonly string[];
  ring: Ring;
  heights: readonly number[];
  planar: boolean;
}>;

export type RoofSegment3 = Readonly<{ a: Vec3; b: Vec3 }>;

/** A stretch of a step line (19.3): its low side `a`→`b` and its raised side over the same plan points. */
export type RoofStep = Readonly<{
  lineId: string;
  low: RoofSegment3;
  high: RoofSegment3;
  face: "side" | "wall";
}>;

export type RoofSurface = Readonly<{
  faces: readonly RoofFace[];
  pieces: readonly RoofPiece[];
  /** Auto-fold lines of non-planar faces (relative heights). */
  folds: readonly RoofSegment3[];
  /** Break lines that split faces, in 3D (after splitting at crossings); step lines are in `steps`. */
  breaks: readonly RoofSegment3[];
  /** Step lines (19.3): each stretch with its low and raised heights. */
  steps: readonly RoofStep[];
  /** The outline ring after splitting at points on its edges, with the points' own heights. */
  outline: readonly Vec3[];
  /** The outline's edges with the heights of the face inside them (a step's raise included), counterclockwise. */
  rim: readonly RoofSegment3[];
  /** Authored lines that do not divide a face (outside, disconnected or dangling). */
  looseLineIds: readonly string[];
}>;

const emptySurface: RoofSurface = {
  faces: [],
  pieces: [],
  folds: [],
  breaks: [],
  steps: [],
  outline: [],
  rim: [],
  looseLineIds: [],
};

type Node = { id: string; x: number; y: number; h: number };
type Edge = { a: string; b: string; lineId: string | null };

const edgeKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Parameter of point p on segment a→b (0…1) and its distance from the segment's line. */
const projectOnSegment = (p: Vec2, a: Vec2, b: Vec2): Readonly<{ t: number; distance: number }> => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return { t: 0, distance: Math.hypot(p.x - a.x, p.y - a.y) };
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  const cx = a.x + dx * t;
  const cy = a.y + dy * t;
  return { t, distance: Math.hypot(p.x - cx, p.y - cy) };
};

/** Proper intersection parameters of segments p→q and r→s (both strictly inside), or null. */
export const segmentCrossing = (
  p: Vec2,
  q: Vec2,
  r: Vec2,
  s: Vec2,
): Readonly<{ t: number; u: number; point: Vec2 }> | null => {
  const dx1 = q.x - p.x;
  const dy1 = q.y - p.y;
  const dx2 = s.x - r.x;
  const dy2 = s.y - r.y;
  const denominator = dx1 * dy2 - dy1 * dx2;
  const scale = Math.hypot(dx1, dy1) * Math.hypot(dx2, dy2);
  if (scale === 0 || Math.abs(denominator) <= 1e-9 * scale) return null;
  const t = ((r.x - p.x) * dy2 - (r.y - p.y) * dx2) / denominator;
  const u = ((r.x - p.x) * dy1 - (r.y - p.y) * dx1) / denominator;
  const lengthPq = Math.hypot(dx1, dy1);
  const lengthRs = Math.hypot(dx2, dy2);
  const epsT = roofOnEdgeToleranceMm / lengthPq;
  const epsU = roofOnEdgeToleranceMm / lengthRs;
  if (t <= epsT || t >= 1 - epsT || u <= epsU || u >= 1 - epsU) return null;
  return { t, u, point: { x: p.x + dx1 * t, y: p.y + dy1 * t } };
};

/** The outline ring of a sheet (plan), in its stored order; points missing from `points` are skipped. */
export const sheetOutlineRing = (sheet: RoofSheet): Ring => {
  const byId = new Map(sheet.points.map((point) => [point.id, point]));
  return sheet.outline.flatMap((id) => {
    const point = byId.get(id);
    return point === undefined ? [] : [{ x: point.x, y: point.y }];
  });
};

/** Plane through three points, or null when they are collinear in plan. */
export const planeThrough = (a: Vec3, b: Vec3, c: Vec3): RoofPlane | null => {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uh = b.h - a.h;
  const vx = c.x - a.x;
  const vy = c.y - a.y;
  const vh = c.h - a.h;
  const nx = uy * vh - uh * vy;
  const ny = uh * vx - ux * vh;
  const nh = ux * vy - uy * vx;
  if (Math.abs(nh) < 1e-9) return null;
  const ax = -nx / nh;
  const ay = -ny / nh;
  return { ax, ay, c: a.h - ax * a.x - ay * a.y };
};

export const planeHeight = (plane: RoofPlane, point: Vec2): number =>
  plane.c + plane.ax * point.x + plane.ay * point.y;

/** Best-fit plane of points (Newell normal through the centroid). */
const fitPlane = (points: readonly Vec3[]): RoofPlane | null => {
  let nx = 0;
  let ny = 0;
  let nh = 0;
  let cx = 0;
  let cy = 0;
  let ch = 0;
  points.forEach((current, index) => {
    const next = points[(index + 1) % points.length] ?? current;
    nx += (current.y - next.y) * (current.h + next.h);
    ny += (current.h - next.h) * (current.x + next.x);
    nh += (current.x - next.x) * (current.y + next.y);
    cx += current.x;
    cy += current.y;
    ch += current.h;
  });
  if (Math.abs(nh) < 1e-9 || points.length === 0) return null;
  const count = points.length;
  const ax = -nx / nh;
  const ay = -ny / nh;
  return { ax, ay, c: ch / count - ax * (cx / count) - ay * (cy / count) };
};

const onPlane = (plane: RoofPlane, points: readonly Vec3[]): boolean =>
  points.every((point) => Math.abs(planeHeight(plane, point) - point.h) <= planarToleranceMm);

const cross2 = (o: Vec2, a: Vec2, b: Vec2): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

const pointInTriangle = (p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean => {
  const d1 = cross2(a, b, p);
  const d2 = cross2(b, c, p);
  const d3 = cross2(c, a, p);
  return d1 > 1e-9 && d2 > 1e-9 && d3 > 1e-9;
};

const distance3 = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.h - b.h);

/**
 * Ear clipping of a CCW plan ring (vertex indices into `points`), always cutting the ear with the shortest new
 * diagonal in 3D (ties: lowest vertex index). Returns index triples, CCW in plan.
 */
const triangulateRing = (points: readonly Vec3[]): (readonly [number, number, number])[] => {
  const remaining = points.map((_, index) => index);
  const triangles: (readonly [number, number, number])[] = [];
  let guard = points.length * points.length + 8;
  while (remaining.length > 3 && guard > 0) {
    guard -= 1;
    let best: { at: number; length: number } | null = null;
    for (let at = 0; at < remaining.length; at += 1) {
      const ia = remaining[(at + remaining.length - 1) % remaining.length] ?? 0;
      const ib = remaining[at] ?? 0;
      const ic = remaining[(at + 1) % remaining.length] ?? 0;
      const a = points[ia];
      const b = points[ib];
      const c = points[ic];
      if (a === undefined || b === undefined || c === undefined) continue;
      if (cross2(a, b, c) <= 1e-9) continue;
      const blocked = remaining.some((index) => {
        if (index === ia || index === ib || index === ic) return false;
        const p = points[index];
        return p !== undefined && pointInTriangle(p, a, b, c);
      });
      if (blocked) continue;
      const length = distance3(a, c);
      if (best === null || length < best.length - 1e-6) best = { at, length };
    }
    if (best === null) break;
    const at = best.at;
    const ia = remaining[(at + remaining.length - 1) % remaining.length] ?? 0;
    const ib = remaining[at] ?? 0;
    const ic = remaining[(at + 1) % remaining.length] ?? 0;
    triangles.push([ia, ib, ic]);
    remaining.splice(at, 1);
  }
  if (remaining.length === 3) {
    const [ia = 0, ib = 0, ic = 0] = remaining;
    triangles.push([ia, ib, ic]);
  }
  return triangles;
};

/** The graph of a sheet: nodes (points plus derived crossings), edges split at points on them and at crossings. */
const buildGraph = (
  sheet: RoofSheet,
): Readonly<{ nodes: Map<string, Node>; edges: Edge[]; outline: string[] }> | null => {
  const nodes = new Map<string, Node>();
  for (const point of sheet.points)
    nodes.set(point.id, { id: point.id, x: point.x, y: point.y, h: point.heightMm });
  const outlineIds = sheet.outline.filter((id) => nodes.has(id));
  if (outlineIds.length < 3) return null;
  type Raw = { a: string; b: string; lineId: string | null };
  const raw: Raw[] = [];
  outlineIds.forEach((id, index) => {
    const next = outlineIds[(index + 1) % outlineIds.length];
    if (next !== undefined && next !== id) raw.push({ a: id, b: next, lineId: null });
  });
  for (const line of sheet.lines)
    if (nodes.has(line.a) && nodes.has(line.b) && line.a !== line.b)
      raw.push({ a: line.a, b: line.b, lineId: line.id });
  // Crossings not split by the commands: a derived node on both edges (height along the first).
  const splits = new Map<number, { t: number; id: string }[]>();
  const addSplit = (edgeIndex: number, t: number, id: string): void => {
    const list = splits.get(edgeIndex) ?? [];
    if (!list.some((entry) => entry.id === id)) list.push({ t, id });
    splits.set(edgeIndex, list);
  };
  let crossingCount = 0;
  raw.forEach((first, i) => {
    const p = nodes.get(first.a);
    const q = nodes.get(first.b);
    if (p === undefined || q === undefined) return;
    for (let j = i + 1; j < raw.length; j += 1) {
      const second = raw[j];
      if (second === undefined) continue;
      if ([first.a, first.b].some((id) => id === second.a || id === second.b)) continue;
      const r = nodes.get(second.a);
      const s = nodes.get(second.b);
      if (r === undefined || s === undefined) continue;
      const crossing = segmentCrossing(p, q, r, s);
      if (crossing === null) continue;
      crossingCount += 1;
      const id = `crossing:${String(crossingCount)}`;
      nodes.set(id, { id, x: crossing.point.x, y: crossing.point.y, h: p.h + (q.h - p.h) * crossing.t });
      addSplit(i, crossing.t, id);
      addSplit(j, crossing.u, id);
    }
  });
  // Points lying on an edge split it (T-junctions).
  raw.forEach((edge, index) => {
    const a = nodes.get(edge.a);
    const b = nodes.get(edge.b);
    if (a === undefined || b === undefined) return;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) return;
    for (const node of nodes.values()) {
      if (node.id === edge.a || node.id === edge.b) continue;
      const { t, distance } = projectOnSegment(node, a, b);
      const margin = roofOnEdgeToleranceMm / length;
      if (distance <= roofOnEdgeToleranceMm && t > margin && t < 1 - margin) addSplit(index, t, node.id);
    }
  });
  const edges: Edge[] = [];
  const seen = new Set<string>();
  const outline: string[] = [];
  raw.forEach((edge, index) => {
    const chain = [
      edge.a,
      ...(splits.get(index) ?? []).sort((x, y) => x.t - y.t).map((entry) => entry.id),
      edge.b,
    ];
    if (edge.lineId === null) outline.push(...chain.slice(0, -1));
    for (let k = 0; k + 1 < chain.length; k += 1) {
      const a = chain[k];
      const b = chain[k + 1];
      if (a === undefined || b === undefined || a === b) continue;
      const key = edgeKey(a, b);
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a, b, lineId: edge.lineId });
    }
  });
  return { nodes, edges, outline };
};

/** Faces, planar pieces, folds and breaks of a roof sheet. */
export const roofSurfaceOf = (sheet: RoofSheet): RoofSurface => {
  const graph = buildGraph(sheet);
  if (graph === null) return emptySurface;
  const { nodes, outline } = graph;
  let edges = graph.edges;
  const ring = outline.flatMap((id) => {
    const node = nodes.get(id);
    return node === undefined ? [] : [{ x: node.x, y: node.y }];
  });
  if (ring.length < 3 || ringSignedArea(ring) <= 0) return emptySurface;
  const loose = new Set<string>();
  // Lines outside the outline do not split it.
  edges = edges.filter((edge) => {
    if (edge.lineId === null) return true;
    const a = nodes.get(edge.a);
    const b = nodes.get(edge.b);
    if (a === undefined || b === undefined) return false;
    const inside = pointInRing({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ring);
    if (!inside) loose.add(edge.lineId);
    return inside;
  });
  // Only what connects to the outline splits it; dangling chains are pruned.
  const outlineSet = new Set(outline);
  let changed = true;
  while (changed) {
    changed = false;
    const degree = new Map<string, number>();
    for (const edge of edges) {
      degree.set(edge.a, (degree.get(edge.a) ?? 0) + 1);
      degree.set(edge.b, (degree.get(edge.b) ?? 0) + 1);
    }
    const kept = edges.filter((edge) => {
      if (edge.lineId === null) return true;
      const dangling =
        (!outlineSet.has(edge.a) && (degree.get(edge.a) ?? 0) < 2) ||
        (!outlineSet.has(edge.b) && (degree.get(edge.b) ?? 0) < 2);
      if (dangling) loose.add(edge.lineId);
      return !dangling;
    });
    if (kept.length !== edges.length) {
      edges = kept;
      changed = true;
    }
  }
  const reached = new Set<string>(outline);
  let frontier = [...outline];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const edge of edges)
      for (const [from, to] of [
        [edge.a, edge.b],
        [edge.b, edge.a],
      ] as const)
        if (frontier.includes(from) && !reached.has(to)) {
          reached.add(to);
          next.push(to);
        }
    frontier = next;
  }
  edges = edges.filter((edge) => {
    const connected = reached.has(edge.a) && reached.has(edge.b);
    if (!connected && edge.lineId !== null) loose.add(edge.lineId);
    return connected;
  });
  // Half-edge walk: around each node, neighbours by angle; next(u→v) = (v→w), w just clockwise of u around v.
  const around = new Map<string, string[]>();
  for (const edge of edges) {
    around.set(edge.a, [...(around.get(edge.a) ?? []), edge.b]);
    around.set(edge.b, [...(around.get(edge.b) ?? []), edge.a]);
  }
  for (const [id, neighbours] of around) {
    const centre = nodes.get(id);
    if (centre === undefined) continue;
    neighbours.sort((p, q) => {
      const np = nodes.get(p);
      const nq = nodes.get(q);
      if (np === undefined || nq === undefined) return 0;
      return Math.atan2(np.y - centre.y, np.x - centre.x) - Math.atan2(nq.y - centre.y, nq.x - centre.x);
    });
  }
  // Step lines (19.3): the raised side of each stretch as a directed half-edge (its face is on the left).
  const lineById = new Map(sheet.lines.map((line) => [line.id, line]));
  const stepOfEdge = new Map<string, { mm: number; face: "side" | "wall" }>();
  const raisedEdges = new Map<string, number>();
  for (const edge of edges) {
    const line = edge.lineId === null ? undefined : lineById.get(edge.lineId);
    if (line?.kind !== "step") continue;
    const mm = Math.max(0, line.stepMm ?? 0);
    if (mm <= 0) continue;
    stepOfEdge.set(edgeKey(edge.a, edge.b), { mm, face: line.stepFace ?? "side" });
    const [from, to] = line.raisedSide === "right" ? [edge.b, edge.a] : [edge.a, edge.b];
    raisedEdges.set(`${from}>${to}`, mm);
  }
  const visited = new Set<string>();
  const faces: RoofFace[] = [];
  /** Per face, per corner: the sector index at that node (the corner's outgoing neighbour in `around`). */
  const faceSectors: number[][] = [];
  /** The face on each node's sectors (-1: outside). */
  const sectorFace = new Map<string, number>();
  for (const edge of edges)
    for (const [start, end] of [
      [edge.a, edge.b],
      [edge.b, edge.a],
    ] as const) {
      if (visited.has(`${start}>${end}`)) continue;
      const cycle: string[] = [];
      const sectors: number[] = [];
      let u = start;
      let v = end;
      let guard = edges.length * 2 + 4;
      while (!visited.has(`${u}>${v}`) && guard > 0) {
        guard -= 1;
        visited.add(`${u}>${v}`);
        cycle.push(u);
        const neighbours = around.get(v) ?? [];
        const index = neighbours.indexOf(u);
        const sector = (index - 1 + neighbours.length) % neighbours.length;
        sectors.push(sector);
        const w = neighbours[sector];
        if (w === undefined) break;
        u = v;
        v = w;
      }
      const cycleNodes = cycle.flatMap((id) => {
        const node = nodes.get(id);
        return node === undefined ? [] : [node];
      });
      const plan = cycleNodes.map((node) => ({ x: node.x, y: node.y }));
      if (plan.length < 3 || ringSignedArea(plan) <= 1) continue;
      // sectors[k] is the sector at the walk's next node, cycle[k + 1]: rotate so it lines up with cycle[k].
      const atNode = cycle.map((_, k) => sectors[(k - 1 + cycle.length) % cycle.length] ?? -1);
      cycle.forEach((id, index) => sectorFace.set(`${id}#${String(atNode[index] ?? -1)}`, faces.length));
      faceSectors.push(atNode);
      faces.push({
        nodeIds: cycleNodes.map((node) => node.id),
        ring: plan,
        heights: cycleNodes.map((node) => node.h),
        planar: false,
      });
    }
  // Step raises per node sector: seeded by the step bounding a sector on its raised side, spread across ordinary
  // lines (never across another step or the outside).
  const sectorRaise = new Map<string, number>();
  if (raisedEdges.size > 0)
    for (const [v, neighbours] of around) {
      const count = neighbours.length;
      const raise = neighbours.map((_, i) => {
        const low = neighbours[i];
        const high = neighbours[(i + 1) % count];
        // Sector i is left of v→n_i and right of v→n_(i+1) (= left of n_(i+1)→v).
        return Math.max(
          low === undefined ? 0 : (raisedEdges.get(`${v}>${low}`) ?? 0),
          high === undefined ? 0 : (raisedEdges.get(`${high}>${v}`) ?? 0),
        );
      });
      const exists = (i: number): boolean => (sectorFace.get(`${v}#${String(i)}`) ?? -1) >= 0;
      const crossesStep = (neighbour: string | undefined): boolean =>
        neighbour !== undefined && stepOfEdge.has(edgeKey(v, neighbour));
      for (let pass = 0; pass < 2 * count; pass += 1)
        for (let i = 0; i < count; i += 1) {
          const next = (i + 1) % count;
          const value = raise[i] ?? 0;
          if (value > 0 && exists(i) && exists(next) && !crossesStep(neighbours[next]))
            raise[next] = Math.max(raise[next] ?? 0, value);
          const before = (i - 1 + count) % count;
          if (value > 0 && exists(i) && exists(before) && !crossesStep(neighbours[i]))
            raise[before] = Math.max(raise[before] ?? 0, value);
        }
      raise.forEach((value, i) => {
        if (value > 0 && exists(i)) sectorRaise.set(`${v}#${String(i)}`, value);
      });
    }
  if (sectorRaise.size > 0)
    faces.forEach((face, faceIndex) => {
      const sectors = faceSectors[faceIndex] ?? [];
      faces[faceIndex] = {
        ...face,
        heights: face.heights.map(
          (h, index) =>
            h + (sectorRaise.get(`${face.nodeIds[index] ?? ""}#${String(sectors[index] ?? -1)}`) ?? 0),
        ),
      };
    });
  /** Heights of each directed half-edge's face (the face on its left) at its two ends. */
  const halfEdges = new Map<string, readonly [Vec3, Vec3]>();
  for (const face of faces)
    face.nodeIds.forEach((id, index) => {
      const nextIndex = (index + 1) % face.nodeIds.length;
      const next = face.nodeIds[nextIndex];
      const a = face.ring[index];
      const b = face.ring[nextIndex];
      if (next === undefined || a === undefined || b === undefined) return;
      halfEdges.set(`${id}>${next}`, [
        { x: a.x, y: a.y, h: face.heights[index] ?? 0 },
        { x: b.x, y: b.y, h: face.heights[nextIndex] ?? 0 },
      ]);
    });
  // Pieces and folds.
  const pieces: RoofPiece[] = [];
  const folds: RoofSegment3[] = [];
  const planarFaces = faces.map((face, faceIndex): RoofFace => {
    const points: Vec3[] = face.ring.map((point, index) => ({
      x: point.x,
      y: point.y,
      h: face.heights[index] ?? 0,
    }));
    const fit = fitPlane(points);
    const planar = fit !== null && (points.length === 3 || onPlane(fit, points));
    const triangles = triangulateRing(points);
    if (planar) {
      pieces.push({
        faceIndex,
        plane: fit,
        triangles: triangles.flatMap(([ia, ib, ic]) => {
          const a = points[ia];
          const b = points[ib];
          const c = points[ic];
          return a === undefined || b === undefined || c === undefined ? [] : [[a, b, c] as const];
        }),
      });
      return { ...face, planar: true };
    }
    // Auto-fold: merge triangles across shared diagonals while they stay on one plane.
    const groups = triangles.map((triangle) => [triangle]);
    const groupOf = triangles.map((_, index) => index);
    const diagonals: { i: number; j: number; a: number; b: number; length: number }[] = [];
    triangles.forEach((first, i) => {
      for (let j = i + 1; j < triangles.length; j += 1) {
        const second = triangles[j];
        if (second === undefined) continue;
        const shared = first.filter((index) => second.includes(index));
        const [a, b] = shared;
        if (shared.length !== 2 || a === undefined || b === undefined) continue;
        const pa = points[a];
        const pb = points[b];
        if (pa === undefined || pb === undefined) continue;
        diagonals.push({ i, j, a, b, length: distance3(pa, pb) });
      }
    });
    diagonals.sort((x, y) => x.length - y.length || Math.min(x.a, x.b) - Math.min(y.a, y.b));
    const vertexSet = (group: number): Vec3[] =>
      [...new Set((groups[group] ?? []).flat())].flatMap((index) => {
        const point = points[index];
        return point === undefined ? [] : [point];
      });
    for (const diagonal of diagonals) {
      const gi = groupOf[diagonal.i] ?? diagonal.i;
      const gj = groupOf[diagonal.j] ?? diagonal.j;
      if (gi === gj) continue;
      const merged = [...vertexSet(gi), ...vertexSet(gj)];
      const [p0, p1, p2] = vertexSet(gi);
      const plane =
        p0 !== undefined && p1 !== undefined && p2 !== undefined ? planeThrough(p0, p1, p2) : null;
      if (plane === null || !onPlane(plane, merged)) continue;
      groups[gi] = [...(groups[gi] ?? []), ...(groups[gj] ?? [])];
      groups[gj] = [];
      groupOf.forEach((group, index) => {
        if (group === gj) groupOf[index] = gi;
      });
    }
    for (const diagonal of diagonals) {
      if (groupOf[diagonal.i] === groupOf[diagonal.j]) continue;
      const a = points[diagonal.a];
      const b = points[diagonal.b];
      if (a !== undefined && b !== undefined) folds.push({ a, b });
    }
    groups.forEach((group) => {
      if (group.length === 0) return;
      const first = group[0];
      if (first === undefined) return;
      const [p0, p1, p2] = first.map((index) => points[index]);
      const plane =
        p0 !== undefined && p1 !== undefined && p2 !== undefined ? planeThrough(p0, p1, p2) : null;
      if (plane === null) return;
      pieces.push({
        faceIndex,
        plane,
        triangles: group.flatMap(([ia, ib, ic]) => {
          const a = points[ia];
          const b = points[ib];
          const c = points[ic];
          return a === undefined || b === undefined || c === undefined ? [] : [[a, b, c] as const];
        }),
      });
    });
    return { ...face, planar: false };
  });
  const breaks = edges.flatMap((edge): RoofSegment3[] => {
    if (edge.lineId === null || stepOfEdge.has(edgeKey(edge.a, edge.b))) return [];
    const a = nodes.get(edge.a);
    const b = nodes.get(edge.b);
    return a === undefined || b === undefined ? [] : [{ a, b }];
  });
  const steps = edges.flatMap((edge): RoofStep[] => {
    const step = stepOfEdge.get(edgeKey(edge.a, edge.b));
    if (step === undefined || edge.lineId === null) return [];
    const line = lineById.get(edge.lineId);
    const [from, to] = line?.raisedSide === "right" ? [edge.b, edge.a] : [edge.a, edge.b];
    const high = halfEdges.get(`${from}>${to}`);
    const low = halfEdges.get(`${to}>${from}`);
    if (high === undefined || low === undefined) return [];
    return [
      {
        lineId: edge.lineId,
        high: { a: high[0], b: high[1] },
        low: { a: low[1], b: low[0] },
        face: step.face,
      },
    ];
  });
  const outline3 = outline.flatMap((id) => {
    const node = nodes.get(id);
    return node === undefined ? [] : [{ x: node.x, y: node.y, h: node.h }];
  });
  const rim = outline.flatMap((id, index): RoofSegment3[] => {
    const next = outline[(index + 1) % outline.length];
    const heights = next === undefined ? undefined : halfEdges.get(`${id}>${next}`);
    if (heights !== undefined) return [{ a: heights[0], b: heights[1] }];
    const a = nodes.get(id);
    const b = next === undefined ? undefined : nodes.get(next);
    return a === undefined || b === undefined ? [] : [{ a, b }];
  });
  return {
    faces: planarFaces,
    pieces,
    folds,
    breaks,
    steps,
    outline: outline3,
    rim,
    looseLineIds: [...loose].filter((id) => sheet.lines.some((line) => line.id === id)),
  };
};

const surfaceCache = new DraftSafeWeakMap<RoofSheet, RoofSurface>();

/** roofSurfaceOf memoized by the roof value (an unchanged roof derives nothing again). */
export const roofSurface = (sheet: RoofSheet): RoofSurface => {
  const cached = surfaceCache.get(sheet);
  if (cached !== undefined) return cached;
  const surface = roofSurfaceOf(sheet);
  surfaceCache.set(sheet, surface);
  return surface;
};

/** The roof's relative height over a plan point (its underside above the eave), or null outside every face. */
export const roofHeightAt = (surface: RoofSurface, point: Vec2): number | null => {
  for (const piece of surface.pieces)
    for (const [a, b, c] of piece.triangles) {
      const d1 = cross2(a, b, point);
      const d2 = cross2(b, c, point);
      const d3 = cross2(c, a, point);
      if (d1 >= -1e-6 && d2 >= -1e-6 && d3 >= -1e-6) return planeHeight(piece.plane, point);
    }
  return null;
};

/** Point by ID. */
export const roofPointById = (sheet: RoofSheet, id: string): RoofPointValue | undefined =>
  sheet.points.find((point) => point.id === id);

/** A line's two points, or undefined when one is missing. */
export const roofLineEnds = (
  sheet: RoofSheet,
  line: RoofLineValue,
): readonly [RoofPointValue, RoofPointValue] | undefined => {
  const a = roofPointById(sheet, line.a);
  const b = roofPointById(sheet, line.b);
  return a === undefined || b === undefined ? undefined : [a, b];
};
