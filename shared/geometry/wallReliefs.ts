// Wall reliefs for RealAllWalls (Phase 5.0, D21): a box or niche on a wall face is one prism in plan, active
// between its bottom and top. A box (positive depth) adds its footprint outside the visible face of the
// merged wall stack; a niche (negative depth) cuts its footprint in from that face. Both are measured from
// the merged stack (mergedDepthAt), so on a shared wall a relief works from the face you can see on that
// side. Every prism side is a face owned by the host wall's side and the relief (its material).
import type { AreaValue } from "@shared/domain/schemas/area";
import type { Ring } from "./region";
import { ringSignedArea } from "./region";
import type { FloorBand, WallGeometryIssue } from "./realAllWallsTypes";
import { contactToleranceMm, heightToleranceMm } from "./tolerances";
import { reliefBounds, reliefStrips } from "./reliefStrips";
import type { Vec2 } from "./vector";
import { addVec, scaleVec } from "./vector";
import type { BandFace, RealWall, WallSide } from "./wallBands";
import { mergedDepthAt } from "./wallOpenings";

/** A niche must leave at least this much wall behind it (a hole through is a door or window). */
export const minNicheBackMm = 20;
/** A box overlaps the wall by this much so the union joins them without a seam. */
const boxOverlapMm = 0.5;
/** A flat feature (depth 0) is drawn as a film this thick (mm), so it shows as colour without being extruded. */
export const flatReliefDepthMm = 1;

export type ReliefPrism = Readonly<{
  reliefId: string;
  wallId: string;
  areaId: string;
  side: WallSide;
  /** add: a box (union); cut: a niche (difference). */
  mode: "add" | "cut";
  footprint: Ring;
  bottomMm: number;
  topMm: number;
  /** The prism's sides as faces owned by the host wall side and this relief. */
  faces: readonly BandFace[];
}>;

const ringAt = (host: RealWall, fromMm: number, toMm: number, lo: number, hi: number): Ring => {
  const at = (along: number, offset: number): Vec2 =>
    addVec(
      host.edge.start,
      addVec(scaleVec(host.edge.direction, along), scaleVec(host.edge.outwardNormal, offset)),
    );
  return [at(fromMm, lo), at(toMm, lo), at(toMm, hi), at(fromMm, hi)];
};

export const resolveReliefPrisms = (
  areas: readonly AreaValue[],
  wallsById: ReadonlyMap<string, RealWall>,
  bands: readonly FloorBand[],
): { prisms: ReliefPrism[]; issues: WallGeometryIssue[] } => {
  const prisms: ReliefPrism[] = [];
  const issues: WallGeometryIssue[] = [];
  for (const area of areas) {
    for (const wall of area.walls) {
      const reliefs = wall.reliefs ?? [];
      if (reliefs.length === 0) continue;
      const host = wallsById.get(wall.id);
      if (host === undefined) continue;
      for (const relief of reliefs) {
        if (host.arc !== null) {
          issues.push({ kind: "reliefOnCurvedWall", reliefId: relief.id, wallId: wall.id });
          continue;
        }
        const bounds = reliefBounds(relief.shapes);
        if (bounds === null) continue;
        const startMm = host.spanMm.fromMm + bounds.minX;
        const endMm = host.spanMm.fromMm + bounds.maxX;
        const fitsAlong = host.pieces.some(
          (piece) => piece.fromMm - heightToleranceMm <= startMm && endMm <= piece.toMm + heightToleranceMm,
        );
        if (!fitsAlong || bounds.minY < 0 || bounds.maxY > host.heightMm + heightToleranceMm) {
          issues.push({ kind: "reliefDoesNotFit", reliefId: relief.id, wallId: wall.id });
          continue;
        }
        // A flat feature (depth 0) is colour only; it is drawn as a film this thick, which is not extruded.
        const depthMm = Math.abs(relief.depthMm) < 1 ? flatReliefDepthMm : relief.depthMm;
        const mode = depthMm > 0 ? "add" : "cut";
        for (const strip of reliefStrips(relief.shapes)) {
          const fromMm = host.spanMm.fromMm + strip.fromMm;
          const toMm = host.spanMm.fromMm + strip.toMm;
          const bottomMm = strip.bottomMm;
          const topMm = strip.topMm;
          const depth = mergedDepthAt(host, fromMm, toMm, bands);
          const face = relief.face === "interior" ? depth.lo : depth.hi;
          // Outward from the visible face: −normal on the interior side, +normal on the exterior side.
          const outward = relief.face === "interior" ? -1 : 1;
          let reach = Math.abs(depthMm);
          if (mode === "cut") {
            const maxReach = depth.hi - depth.lo - minNicheBackMm;
            if (reach > maxReach) {
              if (!issues.some((issue) => issue.kind === "reliefTooDeep" && issue.reliefId === relief.id))
                issues.push({ kind: "reliefTooDeep", reliefId: relief.id, wallId: wall.id });
              reach = Math.max(0, maxReach);
            }
            if (reach < 1) continue;
          }
          const [a, b] =
            mode === "add"
              ? [face - outward * boxOverlapMm, face + outward * reach]
              : [face + outward * contactToleranceMm, face - outward * reach];
          const raw = ringAt(host, fromMm, toMm, Math.min(a, b), Math.max(a, b));
          // Faces are directional (solid on the left): a box is solid inside its ring (counterclockwise), a
          // niche is empty inside, so the solid around it runs clockwise along the niche's sides.
          const ccw = ringSignedArea(raw) >= 0 ? raw : [...raw].reverse();
          const footprint = ccw;
          const faceRing = mode === "add" ? ccw : [...ccw].reverse();
          const ref = { wallId: wall.id, areaId: area.id, side: relief.face, reliefId: relief.id };
          prisms.push({
            reliefId: relief.id,
            wallId: wall.id,
            areaId: area.id,
            side: relief.face,
            mode,
            footprint,
            bottomMm,
            topMm: Math.min(topMm, host.heightMm),
            faces: faceRing.map((start, index) => ({
              start,
              end: faceRing[(index + 1) % faceRing.length] ?? start,
              ref,
            })),
          });
        }
      }
    }
  }
  return { prisms, issues };
};
