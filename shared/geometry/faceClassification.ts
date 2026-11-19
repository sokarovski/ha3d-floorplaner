// Face ownership (spec/builder/features/shared-walls.md#face-ownership-and-materials): every slice
// outline segment is split by the band faces it lies on (provenance recovery) and given one owner.
// Priority: interior > exterior > end. Interior faces of different areas on the same piece are an
// ambiguous intrusion case: the thicker band wins (ties by wall ID) and the conflict is flagged.
// Contact faces never appear: the union removed them. Pieces with no face are caps (junctions, reveals).
import type { SourceSegment } from "./provenance";
import { coverSegment, createSourceIndex } from "./provenance";
import type { Region } from "./region";
import { regionRings } from "./region";
import type { ClassifiedEdge, FloorBand, WallGeometryIssue } from "./realAllWallsTypes";
import { lerpVec } from "./vector";
import type { BandFace, BandFaceSide, WallFaceRef } from "./wallBands";

type FacePayload = Readonly<{ ref: WallFaceRef; thicknessMm: number }>;

const sidePriority: Readonly<Record<BandFaceSide, number>> = { interior: 0, exterior: 1, end: 2 };

const pickOwner = (
  owners: readonly SourceSegment<FacePayload>[],
): { owner: WallFaceRef | null; ambiguous: readonly FacePayload[] } => {
  const sorted = owners
    .map((owner) => owner.payload)
    .sort(
      (a, b) =>
        sidePriority[a.ref.side] - sidePriority[b.ref.side] ||
        b.thicknessMm - a.thicknessMm ||
        a.ref.wallId.localeCompare(b.ref.wallId),
    );
  const best = sorted[0];
  if (best === undefined) return { owner: null, ambiguous: [] };
  const rivals =
    best.ref.side === "interior"
      ? sorted.filter((payload) => payload.ref.side === "interior" && payload.ref.areaId !== best.ref.areaId)
      : [];
  return { owner: best.ref, ambiguous: rivals.length > 0 ? [best, ...rivals] : [] };
};

export const classifySliceEdges = (
  footprint: Region,
  bands: readonly FloorBand[],
  /** Sides of the boxes and niches active in this slice (Phase 5.0), owned by their host wall side. */
  reliefFaces: readonly BandFace[] = [],
): { edges: ClassifiedEdge[]; issues: WallGeometryIssue[] } => {
  const sources: SourceSegment<FacePayload>[] = [
    ...bands.flatMap((band) =>
      band.faces.map((face) => ({
        start: face.start,
        end: face.end,
        payload: { ref: face.ref, thicknessMm: band.wall.thicknessMm },
      })),
    ),
    ...reliefFaces.map((face) => ({
      start: face.start,
      end: face.end,
      payload: { ref: face.ref, thicknessMm: 0 },
    })),
  ];
  const index = createSourceIndex(sources);
  const edges: ClassifiedEdge[] = [];
  const issues: WallGeometryIssue[] = [];
  for (const ring of regionRings(footprint)) {
    ring.forEach((start, pointIndex) => {
      const end = ring[(pointIndex + 1) % ring.length];
      if (end === undefined) return;
      for (const piece of coverSegment(start, end, index)) {
        const { owner, ambiguous } = pickOwner(piece.owners);
        edges.push({ start: piece.start, end: piece.end, owner });
        if (ambiguous.length > 0) {
          issues.push({
            kind: "ambiguousOwnership",
            wallIds: ambiguous.map((payload) => payload.ref.wallId),
            areaIds: ambiguous.map((payload) => payload.ref.areaId),
            at: lerpVec(piece.start, piece.end, 0.5),
          });
        }
      }
    });
  }
  return { edges, issues };
};
