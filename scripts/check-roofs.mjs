// Roofs (Phases 19.1–19.2, spec/builder/features/roofs.md): the roof sheet, its derived surface and meshes, Add roof, the
// guard rails, the schema, the whole-house layers and the tree, on synthetic floors. Checks faces from break lines
// (and crossing lines split at one shared point), gable and hip heights, a cone from a circle, the auto-fold of a
// non-planar quad, the closed extrusion (volume, normals), ribs (count and direction), Add roof's outline (the
// floor's bounding box + 400 mm), the guard rails, a schema round trip (and older floors without roofs), the
// exterior and overview layers drawing the roof with shadows, the tree row and Add menu; 19.2: the mode fields, walls
// rising to a gable and keeping their top with the option off, a shed's underside, and the demo attic fixture (no
// item above the roof, walls rising to the ridge); 19.3: holes cut through the roof (top, underside, lining, ribs),
// roof windows oriented to their face, the no-fit rules (outside, crossed by a line, pitch), a step line's raised
// side and vertical face, canopies (attached mode cuts nothing, drawn in floor views), the shadow-only ceiling kept
// under the roof (the attic's dark band), and the demo's skylight and terrace canopy. No browser or WebGL.
// Run: npm run roofs:check
import { Value } from "typebox/value";
import { runCommand } from "@shared/domain/commands/command";
import { deleteEntitiesCommand } from "@shared/domain/commands/deleteCommands";
import {
  addCanopyCommand,
  addRoofCommand,
  addRoofHoleCommand,
  moveRoofCommand,
  moveRoofItemsCommand,
  setRoofSheetCommand,
} from "@shared/domain/commands/roofCommands";
import {
  roofEditOverlay,
  roofItemsOverlay,
  roofLineWidthPx,
  roofSelectedItemWidthPx,
} from "../src/features/floor-builder/services/roofOverlay.ts";
import { canAddRoof } from "@shared/domain/house/roofs";
import { indexEntities } from "@shared/domain/house/entityIndex";
import {
  faceAxes,
  pieceFrame,
  roofItemIssues,
  roofOpenings,
  surfaceCoverage,
} from "@shared/geometry/roofOpenings";
import { ceilingUnderRoof } from "@shared/geometry/roofCeiling";
import { pointInRegion, regionArea } from "@shared/geometry/region";
import { roofSurface } from "@shared/geometry/roofSurface";
import { roofMeshes } from "@shared/geometry/roofMesh";
import { attachedRoofsOnly, createRoofLayer } from "../src/renderer/roofLayer.ts";
import { terraceCanopy } from "./fixtures/demoHouses/familyHouse.ts";
import { createFloor, createHouseDocument } from "@shared/domain/house/defaults";
import { hasHouseOverview } from "@shared/domain/house/floorPlacement";
import { addRoofMarginMm, createRoof } from "@shared/domain/house/roofs";
import { createId } from "@shared/domain/ids";
import { House } from "@shared/domain/schemas/house";
import { slabCoverage } from "@shared/geometry/floorSlab";
import { regionBounds } from "@shared/geometry/region";
import { buildRoofMeshes } from "@shared/geometry/roofMesh";
import {
  addBreakLine,
  deleteFromSheet,
  movePoints,
  rectangleSheet,
  replaceOutline,
  sheetFromRing,
} from "@shared/geometry/roofSheet";
import { roofHeightAt, roofSurfaceOf } from "@shared/geometry/roofSurface";
import { fixtureRoom } from "./fixtures/multiStoreyHouse.ts";
import { familyAttic, familyAtticRoof } from "./fixtures/demoHouses/familyAttic.ts";
import { Roof } from "@shared/domain/schemas/roof";
import { buildRealAllWalls } from "@shared/geometry/realAllWalls";
import { itemsAboveRoof } from "@shared/geometry/roofItems";
import { floorRoofLimit, roofUndersideAt } from "@shared/geometry/roofLimit";
import { MeshStandardMaterial } from "three";
import { createHouseExterior } from "../src/renderer/houseExterior.ts";
import { helperPalette } from "../src/renderer/helperPalette.ts";
import { openingSizeFromParameters } from "@shared/domain/templates/openingSize";
import { buildHouseTree } from "../src/features/floor-builder/services/houseTree.ts";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === "" ? "" : `  (${detail})`}`);
};
const near = (a, b, tolerance = 0.5) => Math.abs(a - b) <= tolerance;
const ids = { point: () => createId("rp"), line: () => createId("rl") };
const unwrap = (result, label) => {
  if (!result.ok) throw new Error(`${label}: ${result.message}`);
  return result.sheet;
};
const pointAt = (sheet, x, y) => sheet.points.find((point) => near(point.x, x, 1) && near(point.y, y, 1));
const lift = (sheet, x, y, h) => {
  const point = pointAt(sheet, x, y);
  if (point === undefined) throw new Error(`no point at ${String(x)}, ${String(y)}`);
  return unwrap(movePoints(sheet, [point.id], { x: 0, y: 0, h }), "lift");
};

/** Signed volume of a closed triangle mesh (divergence theorem); positive when outward-wound. */
/** The cut of a roof inside its coverage (a cut never leaves the roof). */
const intersectCut = (roof) => roofOpenings(roof).cut;

const meshVolume = (buffers) => {
  let volume = 0;
  const p = buffers.positions;
  for (let index = 0; index < buffers.indices.length; index += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => (buffers.indices[index + k] ?? 0) * 3);
    const ax = p[a] ?? 0;
    const ay = p[a + 1] ?? 0;
    const ah = p[a + 2] ?? 0;
    const bx = p[b] ?? 0;
    const by = p[b + 1] ?? 0;
    const bh = p[b + 2] ?? 0;
    const cx = p[c] ?? 0;
    const cy = p[c + 1] ?? 0;
    const ch = p[c + 2] ?? 0;
    volume += (ax * (by * ch - bh * cy) - ay * (bx * ch - bh * cx) + ah * (bx * cy - by * cx)) / 6;
  }
  return volume;
};
/** Whether every triangle's winding agrees with its vertex normals. */
const windingMatchesNormals = (buffers) => {
  const p = buffers.positions;
  const n = buffers.normals;
  for (let index = 0; index < buffers.indices.length; index += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => (buffers.indices[index + k] ?? 0) * 3);
    const ux = (p[b] ?? 0) - (p[a] ?? 0);
    const uy = (p[b + 1] ?? 0) - (p[a + 1] ?? 0);
    const uh = (p[b + 2] ?? 0) - (p[a + 2] ?? 0);
    const vx = (p[c] ?? 0) - (p[a] ?? 0);
    const vy = (p[c + 1] ?? 0) - (p[a + 1] ?? 0);
    const vh = (p[c + 2] ?? 0) - (p[a + 2] ?? 0);
    const cx = uy * vh - uh * vy;
    const cy = uh * vx - ux * vh;
    const ch = ux * vy - uy * vx;
    const dot = cx * (n[a] ?? 0) + cy * (n[a + 1] ?? 0) + ch * (n[a + 2] ?? 0);
    if (Math.hypot(cx, cy, ch) > 1e-6 && dot <= 0) return false;
  }
  return true;
};
const unitNormals = (buffers) => {
  for (let index = 0; index < buffers.normals.length; index += 3) {
    const length = Math.hypot(
      buffers.normals[index] ?? 0,
      buffers.normals[index + 1] ?? 0,
      buffers.normals[index + 2] ?? 0,
    );
    if (!near(length, 1, 1e-4)) return false;
  }
  return true;
};
const roofOf = (sheet, extra = {}) => ({
  id: createId("rf"),
  name: "Roof",
  design: "closed",
  eaveHeightMm: 2600,
  thicknessMm: 200,
  topMaterial: createFloor("x").slabMaterial,
  bottomMaterial: createFloor("x").slabMaterial,
  sideMaterial: createFloor("x").slabMaterial,
  ribHeightMm: 160,
  ribWidthMm: 60,
  ribSpacingMm: 600,
  ribMaterial: "wood",
  ...sheet,
  ...extra,
});

// ---- faces from break lines ----------------------------------------------------------------------

const W = 10000;
const D = 8000;
const flat = rectangleSheet({ x: 0, y: 0 }, { x: W, y: D }, ids);
check(
  "flat rectangle: one planar face",
  roofSurfaceOf(flat).faces.length === 1 && roofSurfaceOf(flat).pieces.length === 1,
);
const gableLines = unwrap(addBreakLine(flat, { x: 0, y: D / 2 }, { x: W, y: D / 2 }, ids), "ridge");
const gableSurface0 = roofSurfaceOf(gableLines);
check(
  "a middle line splits the outline into two faces; its ends join the outline",
  gableSurface0.faces.length === 2 && gableLines.outline.length === 6 && gableLines.lines.length === 1,
);
const crossed = unwrap(
  addBreakLine(
    unwrap(addBreakLine(flat, { x: 0, y: 0 }, { x: W, y: D }, ids), "diag 1"),
    { x: W, y: 0 },
    { x: 0, y: D },
    ids,
  ),
  "diag 2",
);
const centre = pointAt(crossed, W / 2, D / 2);
check(
  "crossing lines are split at one shared point (4 lines, 4 faces)",
  centre !== undefined &&
    crossed.lines.length === 4 &&
    crossed.lines.every((line) => line.a === centre.id || line.b === centre.id) &&
    roofSurfaceOf(crossed).faces.length === 4,
);

// ---- gable and hip --------------------------------------------------------------------------------

const ridge = 3000;
const gable = lift(lift(gableLines, 0, D / 2, ridge), W, D / 2, ridge);
const gableSurface = roofSurfaceOf(gable);
check(
  "gable: two planar faces, no folds",
  gableSurface.faces.length === 2 &&
    gableSurface.faces.every((face) => face.planar) &&
    gableSurface.folds.length === 0,
);
check(
  "gable heights: 0 at the eaves, 3000 at the ridge, 1500 half way",
  near(roofHeightAt(gableSurface, { x: 2000, y: 0.001 }) ?? -1, 0, 1) &&
    near(roofHeightAt(gableSurface, { x: 2000, y: D / 2 }) ?? -1, ridge, 1) &&
    near(roofHeightAt(gableSurface, { x: 7000, y: D / 4 }) ?? -1, ridge / 2, 1),
);
const hip = unwrap(movePoints(crossed, [centre?.id ?? ""], { x: 0, y: 0, h: 2500 }), "hip");
const hipSurface = roofSurfaceOf(hip);
check(
  "hip: four triangular planar faces meeting at 2500",
  hipSurface.faces.length === 4 &&
    hipSurface.faces.every((face) => face.ring.length === 3 && face.planar) &&
    near(roofHeightAt(hipSurface, { x: W / 2, y: D / 2 }) ?? -1, 2500, 1),
);
const hipDrop = roofHeightAt(hipSurface, { x: W / 2, y: D / 4 }) ?? -1;
check("hip: a quarter of the way in is half height", near(hipDrop, 1250, 1), `${hipDrop.toFixed(1)}`);

// ---- cone from a circle --------------------------------------------------------------------------

const segments = 24;
const radius = 4000;
const circle = Array.from({ length: segments }, (_, k) => ({
  x: radius * Math.cos((2 * Math.PI * k) / segments),
  y: radius * Math.sin((2 * Math.PI * k) / segments),
}));
let cone = sheetFromRing(circle, ids);
const first = cone.points[0];
cone = unwrap(addBreakLine(cone, { x: first?.x ?? 0, y: first?.y ?? 0 }, { x: 0, y: 0 }, ids), "spoke 0");
for (let k = 1; k < segments; k += 1) {
  const p = circle[k];
  cone = unwrap(addBreakLine(cone, p ?? { x: 0, y: 0 }, { x: 0, y: 0 }, ids), `spoke ${String(k)}`);
}
cone = lift(cone, 0, 0, 3000);
const coneSurface = roofSurfaceOf(cone);
check(
  "cone: 24 wedges, apex 3000, half way 1500",
  coneSurface.faces.length === segments &&
    near(roofHeightAt(coneSurface, { x: 0, y: 0 }) ?? -1, 3000, 1) &&
    near(
      roofHeightAt(coneSurface, { x: 1700, y: 0.01 }) ?? -1,
      3000 * (1 - 1700 / ((radius * Math.cos(Math.PI / segments)) / Math.cos(Math.PI / segments))),
      60,
    ),
);

// ---- auto-fold -----------------------------------------------------------------------------------

const quad = rectangleSheet({ x: 0, y: 0 }, { x: 6000, y: 4000 }, ids);
const raised = lift(quad, 6000, 4000, 1500);
const foldSurface = roofSurfaceOf(raised);
const fold = foldSurface.folds[0];
check(
  "auto-fold: a quad with one corner up folds into two planar pieces along one line",
  foldSurface.faces.length === 1 &&
    !foldSurface.faces[0]?.planar &&
    foldSurface.pieces.length === 2 &&
    foldSurface.folds.length === 1,
);
check(
  "auto-fold: the fold is the shorter 3D diagonal (through the raised corner's neighbours)",
  fold !== undefined &&
    ((near(fold.a.x, 6000) && near(fold.a.y, 0) && near(fold.b.x, 0) && near(fold.b.y, 4000)) ||
      (near(fold.b.x, 6000) && near(fold.b.y, 0) && near(fold.a.x, 0) && near(fold.a.y, 4000))),
);
check(
  "auto-fold: both pieces stay on their points",
  near(roofHeightAt(foldSurface, { x: 5900, y: 3900 }) ?? -1, 1500 * (1 - (100 + 100 * 1.5) / 6000), 40) &&
    near(roofHeightAt(foldSurface, { x: 100, y: 100 }) ?? -1, 0, 1),
);
const planarAgain = roofSurfaceOf(lift(lift(quad, 6000, 4000, 1500), 6000, 0, 1500));
check(
  "a shed (two corners up together) is planar: no fold",
  planarAgain.folds.length === 0 && planarAgain.pieces.length === 1,
);

// ---- closed extrusion ---------------------------------------------------------------------------

const closedMeshes = buildRoofMeshes(roofOf(gable));
const solid = {
  positions: Float32Array.from([
    ...closedMeshes.top.positions,
    ...closedMeshes.bottom.positions,
    ...closedMeshes.side.positions,
  ]),
  normals: Float32Array.from([
    ...closedMeshes.top.normals,
    ...closedMeshes.bottom.normals,
    ...closedMeshes.side.normals,
  ]),
  uvs: new Float32Array(0),
  indices: Uint32Array.from([
    ...closedMeshes.top.indices,
    ...[...closedMeshes.bottom.indices].map((index) => index + closedMeshes.top.positions.length / 3),
    ...[...closedMeshes.side.indices].map(
      (index) => index + (closedMeshes.top.positions.length + closedMeshes.bottom.positions.length) / 3,
    ),
  ]),
};
const volume = meshVolume(solid);
check(
  "closed: the solid's volume is outline area × thickness (vertical thickness)",
  near(volume, W * D * 200, W * D * 200 * 1e-4),
  `${(volume / 1e9).toFixed(4)} m³`,
);
check(
  "closed: winding agrees with the normals, normals unit length",
  windingMatchesNormals(solid) && unitNormals(solid),
);
check(
  "closed: the top sits thickness above the underside at the ridge (eave 2600)",
  Math.max(...[...closedMeshes.top.positions].filter((_, index) => index % 3 === 2)) === 2600 + ridge + 200,
);
check("closed: no ribs", closedMeshes.ribCount === 0 && closedMeshes.ribs.indices.length === 0);

// ---- ribs ----------------------------------------------------------------------------------------

const openMeshes = buildRoofMeshes(roofOf(gable, { design: "open" }));
const perFace = Math.floor((W - 60) / 600) + 1;
check(
  "open: ribs downhill per face at the spacing plus one along the ridge",
  openMeshes.ribCount === perFace * 2 + 1,
  `${String(openMeshes.ribCount)} ribs, expected ${String(perFace * 2 + 1)}`,
);
const ribs = openMeshes.ribs;
check("open: rib winding agrees with the normals", windingMatchesNormals(ribs) && unitNormals(ribs));
// Downhill on the gable runs along ±y: every rib side normal is ±x (vertical sides across x).
let sideNormalsAlongX = 0;
for (let index = 0; index < ribs.normals.length; index += 3)
  if (near(Math.abs(ribs.normals[index] ?? 0), 1, 1e-4)) sideNormalsAlongX += 1;
check("open: the face ribs run downhill (their sides face ±x)", sideNormalsAlongX > perFace * 2 * 8);
const flatRibs = buildRoofMeshes(
  roofOf(rectangleSheet({ x: 0, y: 0 }, { x: 6000, y: 3000 }, ids), { design: "open" }),
);
check(
  "open, flat: ribs parallel to the longest edge",
  flatRibs.ribCount === Math.floor((3000 - 60) / 600) + 1,
  `${String(flatRibs.ribCount)} ribs`,
);
const openVolume = meshVolume({
  positions: Float32Array.from([
    ...openMeshes.top.positions,
    ...openMeshes.bottom.positions,
    ...openMeshes.side.positions,
  ]),
  normals: new Float32Array(0),
  uvs: new Float32Array(0),
  indices: solid.indices,
});
check(
  "open: the deck is the same solid as the closed roof",
  near(openVolume, volume, Math.abs(volume) * 1e-6),
);

// ---- Add roof -----------------------------------------------------------------------------------

const house = createHouseDocument(createId("h"), "Roof fixture");
const ground = house.floors[0];
const room = fixtureRoom("Living", { x: 3000, y: 2000 }, { width: 6000, depth: 4000 }, 2600);
ground.areas.push(room);
const upper = {
  ...createFloor("Upper", 2800),
  areas: [fixtureRoom("Bed", { x: 3000, y: 2000 }, { width: 6000, depth: 4000 }, 2500)],
};
house.floors.push(upper);
const added = addRoofCommand(house, ground.id);
check("Add roof: refused on a floor that is not the top floor", "message" in added);
const addTop = addRoofCommand(house, upper.id);
const outcome = "command" in addTop ? runCommand(house, addTop.command) : { ok: false };
const roofed = outcome.ok && outcome.changed ? outcome.document : house;
const roof = roofed.floors.find((floor) => floor.id === upper.id)?.roofs?.[0];
const bounds = regionBounds(slabCoverage(upper));
const xs = roof?.points.map((point) => point.x) ?? [];
const ys = roof?.points.map((point) => point.y) ?? [];
check(
  "Add roof: a flat roof over the floor's bounding box + 400 mm, eave at the tallest wall",
  roof !== undefined &&
    roof.points.length === 4 &&
    roof.points.every((point) => point.heightMm === 0) &&
    near(Math.min(...xs), bounds.minX - addRoofMarginMm) &&
    near(Math.max(...xs), bounds.maxX + addRoofMarginMm) &&
    near(Math.min(...ys), bounds.minY - addRoofMarginMm) &&
    near(Math.max(...ys), bounds.maxY + addRoofMarginMm) &&
    roof.eaveHeightMm === 2500,
  roof === undefined ? "no roof" : `${String(Math.min(...xs))}…${String(Math.max(...xs))}`,
);
check("Add roof: a second roof on the same floor is refused", "message" in addRoofCommand(roofed, upper.id));
check(
  "a one-floor house with a roof has a whole-house level",
  hasHouseOverview({ floors: [{ ...ground, roofs: roof === undefined ? [] : [roof] }] }),
);
check("Add roof: no rooms, no roof", createRoof(createFloor("Empty"), house, "Roof") === null);

// ---- guard rails --------------------------------------------------------------------------------

const someId = gable.points[0]?.id ?? "";
const below = movePoints(gable, [someId], { x: 0, y: 0, h: -10 });
check("guard: no point below the base", !below.ok);
const outside = addBreakLine(flat, { x: 2000, y: 2000 }, { x: 14000, y: 2000 }, ids);
check("guard: a break line may not leave the roof", !outside.ok);
const corner = pointAt(flat, W, D);
const crossing = movePoints(flat, [corner?.id ?? ""], { x: -W - 3000, y: -D / 2, h: 0 });
check("guard: an outline may not cross itself", !crossing.ok);
const tooFew = deleteFromSheet(flat, flat.outline.slice(0, 2), []);
check("guard: an outline keeps three points", !tooFew.ok);
const bowtie = replaceOutline(
  [
    { x: 0, y: 0 },
    { x: 100, y: 100 },
    { x: 100, y: 0 },
    { x: 0, y: 100 },
  ],
  ids,
);
check("guard: a self-crossing new outline is refused", !bowtie.ok);
const deleteRidge = deleteFromSheet(
  gable,
  [],
  gable.lines.map((line) => line.id),
);
check(
  "deleting the ridge line removes it; its ends stay outline points",
  deleteRidge.ok && deleteRidge.sheet.lines.length === 0 && deleteRidge.sheet.points.length === 6,
);
const midline = unwrap(addBreakLine(flat, { x: 2000, y: 2000 }, { x: 8000, y: 2000 }, ids), "interior line");
const interior = deleteFromSheet(
  midline,
  [],
  midline.lines.map((line) => line.id),
);
check(
  "no loose points: deleting an interior line removes its points",
  interior.ok && interior.sheet.points.length === 4 && roofSurfaceOf(midline).looseLineIds.length === 1,
);

// ---- schema round trip --------------------------------------------------------------------------

check("schema: a house with a roof is valid", Value.Check(House, roofed));
const roundTrip = JSON.parse(JSON.stringify(roofed));
check(
  "schema: JSON round trip keeps the roof",
  Value.Check(House, roundTrip) && JSON.stringify(roundTrip) === JSON.stringify(roofed),
);
const legacy = structuredClone(house);
for (const floor of legacy.floors) delete floor.roofs;
check("schema: floors without roofs stay valid (no migration)", Value.Check(House, legacy));
if (roof !== undefined) {
  const withGable = setRoofSheetCommand(
    upper.id,
    roof.id,
    { points: gable.points, outline: gable.outline, lines: gable.lines },
    "Edit roof",
  );
  const edited = runCommand(roofed, withGable);
  check(
    "command: a sheet edit is one undoable step",
    edited.ok && edited.changed && edited.entry.forward.length > 0,
  );
  const bad = setRoofSheetCommand(
    upper.id,
    roof.id,
    { ...gable, points: gable.points.map((point) => ({ ...point, heightMm: -1 })) },
    "Bad",
  );
  check("command: the guard rails refuse a bad sheet", !runCommand(roofed, bad).ok);
  const pointId = roof.points[0]?.id ?? "";
  const triangle = runCommand(roofed, deleteEntitiesCommand(roofed, [pointId]));
  check(
    "delete: an outline corner goes through the sheet (a triangle is left); two more are refused",
    triangle.ok &&
      triangle.changed &&
      triangle.document.floors[1]?.roofs?.[0]?.outline.length === 3 &&
      !runCommand(
        roofed,
        deleteEntitiesCommand(
          roofed,
          roof.points.slice(0, 2).map((point) => point.id),
        ),
      ).ok,
  );
  check(
    "delete: the roof itself",
    (() => {
      const result = runCommand(roofed, deleteEntitiesCommand(roofed, [roof.id]));
      return result.ok && result.changed && (result.document.floors[1]?.roofs ?? []).length === 0;
    })(),
  );
}

// ---- 19.2: the roof cuts walls -------------------------------------------------------------------

const addedRoof = roofed.floors[1]?.roofs?.[0];
check(
  "Add roof: Cuts walls and Walls rise to the roof are on",
  addedRoof?.cutsWalls === true && addedRoof.wallsRise === true,
);
check(
  "properties: Cuts walls and Walls rise are schema toggles (Walls rise shown while it cuts)",
  Roof.properties.cutsWalls["x-homeplan"]?.editor === "toggle" &&
    Roof.properties.wallsRise["x-homeplan"]?.editor === "toggle" &&
    Roof.properties.wallsRise["x-homeplan"]?.visibleWhen?.property === "cutsWalls",
);
if (addedRoof !== undefined) {
  // Pull a ridge along x (y = 2000) up 1500 mm: the gable walls (x = 0, 6000) rise to 2500 + 1500 = 4000 mm.
  const ridged = lift(
    lift(
      unwrap(addBreakLine(addedRoof, { x: -600, y: 2000 }, { x: 6600, y: 2000 }, ids), "ridge"),
      -600,
      2000,
      1500,
    ),
    6600,
    2000,
    1500,
  );
  const gabled = { ...addedRoof, ...ridged };
  const upperFloor = { ...roofed.floors[1], roofs: [gabled] };
  const limit = floorRoofLimit(upperFloor);
  const walls = buildRealAllWalls(upperFloor, openingSizeFromParameters);
  let highest = -Infinity;
  let excess = -Infinity;
  const p = walls.mesh.positions;
  for (let index = 0; index + 2 < p.length; index += 3) {
    const point = { x: p[index] ?? 0, y: p[index + 1] ?? 0 };
    highest = Math.max(highest, p[index + 2] ?? 0);
    excess = Math.max(excess, (p[index + 2] ?? 0) - (roofUndersideAt(limit, point) ?? Infinity));
  }
  check(
    "walls rise: the gable walls reach the ridge (4000 mm), nothing above the underside",
    near(highest, 4000, 0.5) && excess <= 0.05,
    `${highest.toFixed(1)} mm, excess ${excess.toFixed(3)} mm`,
  );
  const flatWalls = buildRealAllWalls(
    { ...upperFloor, roofs: [{ ...gabled, wallsRise: false }] },
    openingSizeFromParameters,
  );
  const flatTop = Math.max(...Array.from(flatWalls.mesh.positions).filter((_, index) => index % 3 === 2));
  check(
    "walls rise off: the walls keep their 2500 mm top",
    near(flatTop, 2500, 0.5),
    `${flatTop.toFixed(1)} mm`,
  );
  const sheetTop = (sheet) =>
    buildRealAllWalls({ ...upperFloor, roofs: [{ ...addedRoof, ...sheet }] }, openingSizeFromParameters);
  // A shed: the north outline edge pulled up 1000 mm; the south walls stay at the eave, the north ones rise.
  const shed = lift(lift(addedRoof, -600, 4600, 1000), 6600, 4600, 1000);
  const shedWalls = sheetTop(shed);
  const shedLimit = floorRoofLimit({ roofs: [{ ...addedRoof, ...shed }] });
  check(
    "a shed roof: the underside over the plan follows its one plane",
    near(roofUndersideAt(shedLimit, { x: 3000, y: 2000 }) ?? NaN, 2500 + (1000 * 2600) / 5200, 0.5) &&
      shedWalls.issues.length === 0,
    `${String(roofUndersideAt(shedLimit, { x: 3000, y: 2000 }))} mm`,
  );
}

// The demo attic (scripts/fixtures/demoHouses/familyAttic.ts) on a floor like the family house's first floor: walls
// at 2600 mm, a window in the east gable (kept), one in the south knee wall (left out) and a low one there (lowered).
const firstLike = {
  ...createFloor("First", 2800),
  areas: [fixtureRoom("Rooms", { x: 5200, y: 4300 }, { width: 10400, depth: 8600 }, 2600)],
};
const window = (name, along, bottomMm, heightMm) => ({
  id: createId("o"),
  name,
  templateId: "window-style-1",
  templateVersion: 1,
  placement: { distanceAlongWallMm: along, bottomMm },
  parameters: { widthMm: 800, heightMm },
  flip: { x: false, z: false },
  materialOverrides: {},
});
const firstRoom = firstLike.areas[0];
const southWall = firstRoom.walls.find((wall) => wall.sourceEdge.edge === "bottom");
const eastWall = firstRoom.walls.find((wall) => wall.sourceEdge.edge === "right");
southWall?.objects.push(window("South", 2000, 900, 1200), window("Low", 5000, 900, 500));
eastWall?.objects.push(window("Gable", 4300, 900, 1200));
const attic = familyAttic(firstLike, { defaultWallHeightMm: 2600 });
const atticRoom = attic.areas[0];
const atticOpenings = atticRoom?.walls.flatMap((wall) => wall.objects) ?? [];
const atticWalls = buildRealAllWalls(attic, openingSizeFromParameters);
const atticTop = Math.max(...Array.from(atticWalls.mesh.positions).filter((_, index) => index % 3 === 2));
check(
  "demo attic: a roof (Cuts walls, rise), no roof cuts, nothing above the roof",
  attic.roofs?.length === 1 &&
    attic.roofs[0]?.cutsWalls === true &&
    !("roofCuts" in attic) &&
    itemsAboveRoof(attic, openingSizeFromParameters).length === 0,
);
check(
  "demo attic: the gable window stays, the knee-wall window is left out, the low one is lowered",
  atticOpenings.some((opening) => opening.name === "Gable" && opening.placement.bottomMm === 900) &&
    !atticOpenings.some((opening) => opening.name === "South") &&
    atticOpenings.some((opening) => opening.name === "Low" && opening.placement.bottomMm < 900),
  atticOpenings.map((opening) => `${opening.name}@${String(opening.placement.bottomMm)}`).join(", "),
);
check(
  "demo attic: the walls rise to the ridge (4220 mm) from their 2600 mm",
  near(atticTop, 4220, 1),
  `${atticTop.toFixed(1)} mm`,
);

// ---- layers and tree ----------------------------------------------------------------------------

const materials = {
  begin: () => undefined,
  get: () => new MeshStandardMaterial(),
  sweep: () => undefined,
  setTexturesEnabled: () => undefined,
  dispose: () => undefined,
};
const exterior = createHouseExterior(materials, helperPalette("light"), 0x03a9f4);
exterior.sync(roofed, openingSizeFromParameters);
materials.begin();
exterior.applyMaterials();
materials.sweep();
const roofMeshNames = [];
exterior.root.traverse((child) => {
  if (child.name.startsWith("roof:") && "castShadow" in child && child.castShadow === true)
    roofMeshNames.push(child.name);
});
check(
  "exterior: the roof is drawn and casts shadows",
  roofMeshNames.some((name) => name.endsWith(":top")),
);
const exteriorBounds = exterior.bounds();
check(
  "exterior: the bounds reach the roof's top and overhang",
  exteriorBounds !== null &&
    exteriorBounds.maxHeightMm >= 2800 + 2500 + 200 &&
    near(exteriorBounds.minX, bounds.minX - 400, 1),
);
exterior.dispose();

const tree = buildHouseTree(roofed, { orphanWallIds: new Set(), flaggedIds: new Set() });
const upperRow = tree.children?.find((node) => node.id === upper.id);
const groundRow = tree.children?.find((node) => node.id === ground.id);
check(
  "tree: the roof is a row under the top floor",
  upperRow?.children?.some((node) => node.id === roof?.id && node.icon === "roof") === true,
);
check(
  "tree: Add roof on the top floor only, and not twice",
  groundRow?.addItems?.some((item) => item.id === "add:roof") === false &&
    upperRow?.addItems?.some((item) => item.id === "add:roof") === false &&
    buildHouseTree(house, { orphanWallIds: new Set(), flaggedIds: new Set() })
      .children?.find((node) => node.id === upper.id)
      ?.addItems?.some((item) => item.id === "add:roof") === true,
);

check(
  "tree: no roof-cut rows or Add items (19.2: roof cuts are roofs)",
  JSON.stringify(tree).includes("roofCut") === false,
);

// ---- Phase 19.3: holes, roof windows, step lines, canopies ------------------------------------------

// In a block of its own, so its names do not meet the 19.1–19.2 checks above.
{
  /** Total area of a mesh's triangles in plan (mm²). */
  const planArea = (buffers) => {
    let area = 0;
    const p = buffers.positions;
    for (let index = 0; index < buffers.indices.length; index += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => (buffers.indices[index + k] ?? 0) * 3);
      area += Math.abs(((p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[c] - p[a]) * (p[b + 1] - p[a + 1])) / 2);
    }
    return area;
  };
  const roofWith = (sheet, extra = {}) => ({
    ...createRoof(
      {
        ...createFloor("Tmp", 0),
        areas: [fixtureRoom("R", { x: 0, y: 0 }, { width: 1000, depth: 1000 }, 2500)],
      },
      { defaultWallHeightMm: 2500 },
      "Roof",
    ),
    ...sheet,
    ...extra,
  });
  const square = (x, y, half) => [
    { x: x - half, y: y - half },
    { x: x + half, y: y - half },
    { x: x + half, y: y + half },
    { x: x - half, y: y + half },
  ];

  // A flat 10 × 6 m roof with a 1 × 1 m hole in the middle.
  const flatSheet = rectangleSheet({ x: 0, y: 0 }, { x: 10000, y: 6000 }, ids);
  const holed = roofWith(flatSheet, {
    holes: [{ id: createId("rh"), name: "Hole 1", points: square(5000, 3000, 500) }],
  });
  const holedMeshes = roofMeshes(holed);
  check(
    "hole: cut out of the top and the underside",
    near(planArea(holedMeshes.top), 60e6 - 1e6, 1000) && near(planArea(holedMeshes.bottom), 60e6 - 1e6, 1000),
    `${(planArea(holedMeshes.top) / 1e6).toFixed(3)} m²`,
  );
  const solid = {
    positions: Float32Array.from([
      ...holedMeshes.top.positions,
      ...holedMeshes.bottom.positions,
      ...holedMeshes.side.positions,
    ]),
    indices: Uint32Array.from([
      ...holedMeshes.top.indices,
      ...[...holedMeshes.bottom.indices].map((i) => i + holedMeshes.top.positions.length / 3),
      ...[...holedMeshes.side.indices].map(
        (i) => i + (holedMeshes.top.positions.length + holedMeshes.bottom.positions.length) / 3,
      ),
    ]),
  };
  check(
    "hole: lined, the roof stays a closed solid (volume = (area − hole) × thickness)",
    near(meshVolume(solid), (60e6 - 1e6) * holed.thicknessMm, 60e6 * holed.thicknessMm * 1e-4),
    `${(meshVolume(solid) / 1e9).toFixed(4)} m³`,
  );
  const holedOpen = roofMeshes({ ...holed, design: "open" });
  let ribInHole = false;
  for (let at = 0; at < holedOpen.ribs.positions.length; at += 3) {
    const x = holedOpen.ribs.positions[at];
    const y = holedOpen.ribs.positions[at + 1];
    if (x > 4500 + 1 && x < 5500 - 1 && y > 2500 + 1 && y < 3500 - 1) ribInHole = true;
  }
  check("hole: ribs are clipped by it", holedOpen.ribCount > 0 && !ribInHole);
  const outsideHole = roofWith(flatSheet, {
    holes: [{ id: createId("rh"), name: "Hole far", points: square(20000, 3000, 500) }],
  });
  check(
    "hole: outside the outline cuts nothing and is an issue",
    near(planArea(roofMeshes(outsideHole).top), 60e6, 1000) &&
      roofItemIssues(outsideHole).length === 1 &&
      roofItemIssues(outsideHole)[0]?.message.includes("outside") === true,
  );
  check(
    "hole: a hole changes no wall limit (the underside over it is the roof's)",
    near(
      roofHeightAt(roofSurface(holed), { x: 5000, y: 3000 }) ?? -1,
      roofHeightAt(roofSurface(roofWith(flatSheet)), { x: 5000, y: 3000 }) ?? -2,
    ),
  );

  // A gable 10 × 6 m (ridge along x at y = 3000, 2100 mm up: 35°), windows on its south slope.
  let gableSheet = unwrap(addBreakLine(flatSheet, { x: 0, y: 3000 }, { x: 10000, y: 3000 }, ids), "ridge");
  gableSheet = lift(gableSheet, 0, 3000, 2100);
  gableSheet = lift(gableSheet, 10000, 3000, 2100);
  const windowAt = (x, y, extra = {}) => ({
    id: createId("rw"),
    name: "Skylight",
    templateId: "roof-window",
    templateVersion: 1,
    positionMm: { x, y },
    widthMm: 780,
    lengthMm: 1180,
    minPitchDeg: 15,
    maxPitchDeg: 90,
    ...extra,
  });
  const windowed = roofWith(gableSheet, { windows: [windowAt(5000, 1500)] });
  const placed = roofOpenings(windowed).windows[0];
  const axes = placed?.frame === null || placed === undefined ? null : faceAxes(placed.frame);
  const slope = 2100 / 3000;
  check(
    "roof window: fits on one face, on its pitch",
    placed?.fit === "fits" && near(placed.frame?.pitchDeg ?? 0, (Math.atan(slope) * 180) / Math.PI, 0.01),
  );
  check(
    "roof window: oriented to the face (normal ⟂ slope, up the slope, level along it)",
    axes !== null &&
      near(axes.normal.h, 1 / Math.hypot(1, slope), 1e-6) &&
      near(axes.normal.y, -slope / Math.hypot(1, slope), 1e-6) &&
      near(axes.up.h, slope / Math.hypot(1, slope), 1e-6) &&
      near(axes.along.h, 0, 1e-9) &&
      near(axes.up.x * axes.normal.x + axes.up.y * axes.normal.y + axes.up.h * axes.normal.h, 0, 1e-9),
  );
  check(
    "roof window: cuts its rectangle (plan area = width × length / stretch)",
    near(regionArea(roofOpenings(windowed).cut), (780 * 1180) / Math.hypot(1, slope), 50) &&
      roofItemIssues(windowed).length === 0,
  );
  const crossed = roofWith(gableSheet, { windows: [windowAt(5000, 3000)] });
  const crossedPlaced = roofOpenings(crossed).windows[0];
  check(
    "roof window: crossed by a break line → hole cut on both faces, not drawn, an issue",
    crossedPlaced?.fit === "crossed" &&
      near(regionArea(roofOpenings(crossed).cut), (780 * 1180) / Math.hypot(1, slope), 50) &&
      roofItemIssues(crossed)[0]?.message.includes("crossed") === true,
  );
  const pitched = roofWith(gableSheet, {
    windows: [windowAt(5000, 1500, { minPitchDeg: 0, maxPitchDeg: 15 })],
  });
  check(
    "roof window: a slope outside the template's limits → not drawn, cuts nothing, an issue",
    roofOpenings(pitched).windows[0]?.fit === "pitch" &&
      roofOpenings(pitched).cut.polygons.length === 0 &&
      roofItemIssues(pitched)[0]?.message.includes("slope") === true,
  );
  const outsideWindow = roofWith(gableSheet, { windows: [windowAt(5000, -2000)] });
  check(
    "roof window: outside the outline → not drawn, cuts nothing, an issue",
    roofOpenings(outsideWindow).windows[0]?.fit === "outside" &&
      roofOpenings(outsideWindow).cut.polygons.length === 0 &&
      roofItemIssues(outsideWindow).length === 1,
  );
  const layer = createRoofLayer(materials);
  layer.sync({
    roofs: [
      {
        ...windowed,
        windows: [...(windowed.windows ?? []), ...(pitched.windows ?? []), ...(crossed.windows ?? [])],
      },
    ],
  });
  const windowGroups = [];
  layer.root.traverse((child) => {
    if (child.name.startsWith("roofWindow:")) windowGroups.push(child);
  });
  const drawn = windowGroups[0];
  const column = (index) => {
    const e = drawn?.matrix.elements ?? [];
    return { x: e[index * 4] / 1000, y: e[index * 4 + 1] / 1000, h: e[index * 4 + 2] / 1000 };
  };
  check(
    "roof window: only the window that fits is drawn, its z axis the face normal",
    windowGroups.length === 1 &&
      near(column(2).h, 1 / Math.hypot(1, slope), 1e-4) &&
      near(column(1).h, slope / Math.hypot(1, slope), 1e-4),
  );
  layer.dispose();
  const moved = runCommand(
    {
      ...roofed,
      floors: roofed.floors.map((floor) => (floor.id === upper.id ? { ...floor, roofs: [windowed] } : floor)),
    },
    moveRoofItemsCommand(
      upper.id,
      windowed.id,
      [windowed.windows?.[0]?.id ?? ""],
      { x: 500, y: -250 },
      "Move",
    ),
  );
  const movedWindow =
    moved.ok && moved.changed
      ? moved.document.floors.find((floor) => floor.id === upper.id)?.roofs?.[0]?.windows?.[0]
      : undefined;
  check(
    "roof window: moved on the sheet (plan), never in 3D",
    movedWindow !== undefined && near(movedWindow.positionMm.x, 5500) && near(movedWindow.positionMm.y, 1250),
  );
  check(
    "schema: a roof with holes, windows and a step line validates",
    Value.Check(Roof, {
      ...windowed,
      holes: holed.holes,
      lines: windowed.lines.map((line) => ({
        ...line,
        kind: "step",
        stepMm: 400,
        raisedSide: "right",
        stepFace: "wall",
      })),
    }) && Value.Check(Roof, roofWith(flatSheet)),
  );
  const withHole = runCommand(
    {
      ...roofed,
      floors: roofed.floors.map((floor) => (floor.id === upper.id ? { ...floor, roofs: [windowed] } : floor)),
    },
    addRoofHoleCommand(upper.id, windowed.id, {
      id: createId("rh"),
      name: "Hole 1",
      points: square(7000, 1500, 300),
    }),
  );
  const holeDoc = withHole.ok && withHole.changed ? withHole.document : roofed;
  const holeId = holeDoc.floors.find((floor) => floor.id === upper.id)?.roofs?.[0]?.holes?.[0]?.id ?? "";
  const deleted = runCommand(holeDoc, deleteEntitiesCommand(holeDoc, [holeId]));
  check(
    "hole: added, indexed and deleted by ID",
    indexEntities(holeDoc).get(holeId)?.kind === "roofHole" &&
      deleted.ok &&
      deleted.changed &&
      (deleted.document.floors.find((floor) => floor.id === upper.id)?.roofs?.[0]?.holes ?? []).length === 0,
  );

  // A step line from the outline to the outline across a flat sheet: the left (north) side 600 mm higher along it.
  const stepSheet = unwrap(addBreakLine(flatSheet, { x: 5000, y: 0 }, { x: 5000, y: 6000 }, ids), "step");
  const stepped = roofWith({
    ...stepSheet,
    lines: stepSheet.lines.map((line) => ({ ...line, kind: "step", stepMm: 600, raisedSide: "left" })),
  });
  const stepSurface = roofSurface(stepped);
  const stepLine = stepSurface.steps[0];
  check(
    "step: one step face, its raised side 600 mm higher along the line",
    stepSurface.steps.length === 1 &&
      stepLine !== undefined &&
      near(stepLine.high.a.h - stepLine.low.a.h, 600) &&
      near(stepLine.high.b.h - stepLine.low.b.h, 600) &&
      stepSurface.breaks.length === 0,
  );
  const leftOf = roofHeightAt(stepSurface, { x: 4990, y: 3000 }) ?? 0;
  const rightOf = roofHeightAt(stepSurface, { x: 5010, y: 3000 }) ?? 0;
  check(
    "step: the two sides have their own heights at the line (left raised, the far eave unchanged)",
    near(Math.abs(leftOf - rightOf), 600, 5) &&
      near(roofHeightAt(stepSurface, { x: 1, y: 3000 }) ?? -1, 0, 1) &&
      near(roofHeightAt(stepSurface, { x: 9999, y: 3000 }) ?? -1, 0, 1),
    `${leftOf.toFixed(1)} / ${rightOf.toFixed(1)}`,
  );
  const stepMeshes = roofMeshes(stepped);
  const flatSide = roofMeshes(roofWith(flatSheet)).side.indices.length;
  check(
    "step: a vertical face in the side material (and in the wall material when chosen)",
    stepMeshes.side.indices.length > flatSide &&
      roofMeshes(
        roofWith({ ...stepped, lines: stepped.lines.map((line) => ({ ...line, stepFace: "wall" })) }),
      ).stepWall.indices.length > 0,
  );
  check(
    "step: a split step line stays a step on both halves",
    unwrap(addBreakLine(stepped, { x: 0, y: 3000 }, { x: 10000, y: 3000 }, ids), "cross").lines.filter(
      (line) => line.kind === "step",
    ).length === 2,
  );

  // Canopies: attached roofs (Cuts walls off) on any floor; they cut nothing.
  const canopyAdd = addCanopyCommand(roofed, ground.id, room.id);
  const canopyDoc = "command" in canopyAdd ? runCommand(roofed, canopyAdd.command) : { ok: false };
  const canopyHouse = canopyDoc.ok && canopyDoc.changed ? canopyDoc.document : roofed;
  const canopyFloor = canopyHouse.floors.find((floor) => floor.id === ground.id);
  const canopy = canopyFloor?.roofs?.[0];
  check(
    "canopy: Add canopy on a lower floor, attached (cuts nothing), over its room at 2400 mm or more",
    canopy !== undefined && !canopy.cutsWalls && canopy.eaveHeightMm >= 2400 && canopy.name === "Canopy 1",
  );
  check(
    "canopy: no wall limit, the walls keep their authored heights, nothing above it",
    canopyFloor !== undefined &&
      floorRoofLimit(canopyFloor) === null &&
      buildRealAllWalls(canopyFloor, openingSizeFromParameters).bands.every((band) =>
        near(band.heightMm, 2600),
      ) &&
      itemsAboveRoof(canopyFloor, openingSizeFromParameters).length === 0,
  );
  check(
    "canopy: Add roof still offered on a top floor with only a canopy",
    canAddRoof(roofed, { id: upper.id, roofs: canopy === undefined ? [] : [canopy] }),
  );
  const canopyLayer = createRoofLayer(materials);
  canopyLayer.sync(
    {
      roofs: [
        ...(roofed.floors.find((floor) => floor.id === upper.id)?.roofs ?? []),
        ...(canopy === undefined ? [] : [canopy]),
      ],
    },
    attachedRoofsOnly,
  );
  const drawnRoofs = canopyLayer.root.children.map((child) => child.name);
  check(
    "canopy: floor views draw attached roofs only (never the cutting roof)",
    drawnRoofs.length === 1 && drawnRoofs[0] === `roof:${canopy?.id ?? ""}`,
  );
  canopyLayer.dispose();
  check(
    "tree: Add canopy on every floor and area, Roof window… on a roof",
    JSON.stringify(buildHouseTree(canopyHouse, { orphanWallIds: new Set(), flaggedIds: new Set() })).includes(
      "add:canopy",
    ) &&
      buildHouseTree(canopyHouse, { orphanWallIds: new Set(), flaggedIds: new Set() })
        .children?.find((node) => node.id === upper.id)
        ?.children?.find((node) => node.icon === "roof")
        ?.addItems?.some((item) => item.id === "add:roofWindow") === true,
  );

  // The shadow-only ceiling under the roof (the attic's dark band): never above the underside.
  const atticFloor = familyAttic(upper, { defaultWallHeightMm: 2500 });
  const atticLimit = floorRoofLimit(atticFloor);
  const ceilingOutline = slabCoverage(atticFloor);
  const patches = ceilingUnderRoof(ceilingOutline, 2500, atticLimit);
  let ceilingAbove = 0;
  for (const patch of patches)
    for (const polygon of patch.region.polygons)
      for (const point of polygon.outer) {
        const h = patch.plane.c + patch.plane.ax * point.x + patch.plane.ay * point.y;
        const under = roofUndersideAt(atticLimit, point);
        if (under !== null && h > under + 0.5) ceilingAbove += 1;
        if (h > 2500 + 0.5) ceilingAbove += 1;
      }
  check(
    "ceiling: kept under the underside and the ceiling height, covering the whole outline",
    ceilingAbove === 0 &&
      near(
        patches.reduce((sum, patch) => sum + regionArea(patch.region), 0),
        regionArea(ceilingOutline),
        regionArea(ceilingOutline) * 1e-4,
      ),
  );

  // The demo: a skylight on the Family house attic roof and a canopy over its terrace.
  const demoRoof = familyAtticRoof();
  const demoCanopy = terraceCanopy();
  check(
    "demo: the attic's skylight fits its slope (no issue) and cuts the roof",
    (demoRoof.windows ?? []).length === 1 &&
      roofOpenings(demoRoof).windows[0]?.fit === "fits" &&
      roofItemIssues(demoRoof).length === 0 &&
      regionArea(intersectCut(demoRoof)) > 0,
  );
  check(
    "demo: the terrace canopy is attached (cuts nothing) and valid",
    !demoCanopy.cutsWalls &&
      Value.Check(Roof, demoCanopy) &&
      floorRoofLimit({ roofs: [demoCanopy] }) === null &&
      roofSurface(demoCanopy).pieces.length === 1,
  );
  const pieces = roofSurface(gableSheet).pieces;
  check(
    "face frame: u level along the eave, v up the slope (a gable's south face)",
    pieces.length === 2 &&
      pieces.some((piece) => {
        const frame = pieceFrame(piece);
        return near(Math.abs(frame.along.x), 1, 1e-9) && near(frame.stretch, Math.hypot(1, slope), 1e-9);
      }) &&
      pointInRegion({ x: 5000, y: 1500 }, surfaceCoverage(roofSurface(gableSheet))),
  );
}

// ---- Phase 19.5 ------------------------------------------------------------------------------------

{
  // No gaps under valley ribs: a valley along the middle line (the outline's long sides pulled up 3000 mm over a
  // 2000 mm run each way). A 60 mm rib along it must reach the underside at its sides (45 mm above the line there),
  // not stay at the line's height.
  const valleyLine = unwrap(addBreakLine(flat, { x: 0, y: D / 2 }, { x: W, y: D / 2 }, ids), "valley");
  const valleySheet = [
    [0, 0],
    [W, 0],
    [W, D],
    [0, D],
  ].reduce((sheet, [x, y]) => lift(sheet, x, y, 3000), valleyLine);
  const valleyRoof = roofOf(valleySheet, { design: "open" });
  const valleyRibs = buildRoofMeshes(valleyRoof).ribs.positions;
  const slopeV = 3000 / (D / 2);
  let worstGap = 0;
  let sides = 0;
  for (let index = 0; index < valleyRibs.length; index += 3) {
    const y = valleyRibs[index + 1] ?? 0;
    const h = valleyRibs[index + 2] ?? 0;
    const off = Math.abs(y - D / 2);
    if (!near(off, 30, 0.5)) continue;
    const underside = 2600 + slopeV * off;
    // The rib's top corners (those within its depth of the underside) must be on it.
    if (h < underside - 100) continue;
    sides += 1;
    worstGap = Math.max(worstGap, Math.abs(underside - h));
  }
  check(
    "19.5 valley rib: its sides reach both slopes (no gap under the underside)",
    sides > 0 && worstGap <= 0.5,
    `${String(sides)} top corners, worst gap ${worstGap.toFixed(2)} mm`,
  );

  // A canopy moved whole (Move in its floor view): points, holes and windows with it, the eave by ↑; one step.
  const canopyHouse = createHouseDocument(createId("h"), "Canopy move");
  const canopyFloor = canopyHouse.floors[0];
  const addedCanopy = addCanopyCommand(canopyHouse, canopyFloor.id);
  const withCanopy =
    "command" in addedCanopy ? runCommand(canopyHouse, addedCanopy.command) : { ok: false, changed: false };
  const canopyDoc = withCanopy.ok && withCanopy.changed ? withCanopy.document : canopyHouse;
  const canopy = canopyDoc.floors[0].roofs?.[0];
  const holeId = createId("rh");
  const holed =
    canopy === undefined
      ? undefined
      : runCommand(
          canopyDoc,
          addRoofHoleCommand(canopyFloor.id, canopy.id, {
            id: holeId,
            name: "Hole 1",
            points: [
              { x: canopy.points[0].x + 300, y: canopy.points[0].y + 300 },
              { x: canopy.points[0].x + 600, y: canopy.points[0].y + 300 },
              { x: canopy.points[0].x + 600, y: canopy.points[0].y + 600 },
            ],
          }),
        );
  const before = holed?.ok && holed.changed ? holed.document : canopyDoc;
  const beforeCanopy = before.floors[0].roofs?.[0];
  const moved =
    beforeCanopy === undefined
      ? { ok: false }
      : runCommand(
          before,
          moveRoofCommand(canopyFloor.id, beforeCanopy.id, { x: 500, y: -250, h: 300 }, "Move"),
        );
  const afterCanopy = moved.ok && moved.changed ? moved.document.floors[0].roofs?.[0] : undefined;
  check(
    "19.5 canopy move: points, holes by the offset, eave by ↑ (one command)",
    beforeCanopy !== undefined &&
      afterCanopy !== undefined &&
      afterCanopy.points.every(
        (point, index) =>
          near(point.x, (beforeCanopy.points[index]?.x ?? 0) + 500, 1e-6) &&
          near(point.y, (beforeCanopy.points[index]?.y ?? 0) - 250, 1e-6),
      ) &&
      near(afterCanopy.eaveHeightMm, beforeCanopy.eaveHeightMm + 300, 1e-6) &&
      near(
        afterCanopy.holes?.[0]?.points[0]?.x ?? 0,
        (beforeCanopy.holes?.[0]?.points[0]?.x ?? 0) + 500,
        1e-6,
      ) &&
      Value.Check(Roof, afterCanopy),
  );
  check(
    "19.5 canopy move: below the floor is refused",
    beforeCanopy !== undefined &&
      !runCommand(before, moveRoofCommand(canopyFloor.id, beforeCanopy.id, { x: 0, y: 0, h: -99999 }, "Move"))
        .ok,
  );

  // Thicker overlays: the outline and lines 3 px, a selected hole bold (4 px), other holes 2 px.
  const editOverlay = roofEditOverlay(before.floors[0], beforeCanopy?.id ?? "", []);
  const outline = editOverlay.find((primitive) => primitive.kind === "polyline" && primitive.closed === true);
  const selectedHole = beforeCanopy === undefined ? [] : roofItemsOverlay(beforeCanopy, [holeId]);
  const plainHole = beforeCanopy === undefined ? [] : roofItemsOverlay(beforeCanopy, []);
  check(
    "19.5 overlays: outline 3 px, a selected hole bold, other holes 2 px",
    outline?.widthPx === roofLineWidthPx &&
      roofLineWidthPx >= 3 &&
      selectedHole[0]?.widthPx === roofSelectedItemWidthPx &&
      (plainHole[0]?.widthPx ?? 0) >= 2 &&
      roofSelectedItemWidthPx > (plainHole[0]?.widthPx ?? 0),
  );
}

console.log(failures === 0 ? "\nAll roof checks passed." : `\n${String(failures)} roof check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
