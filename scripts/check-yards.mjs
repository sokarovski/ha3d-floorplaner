// Yards (Phase 17.2, spec/builder/features/yards.md): the yard area kind and its rules on synthetic floors, with the
// built-in fence templates (server/builtin-templates, npm run templates:build). Checks the schema (yards optional,
// older houses valid), Add yard (ground floor only, placement, Lawn, fences on three sides), Add pathway (Paving,
// yards only), the slab without yards, RealAllWalls without yard walls, the yard lawn clipped by the rooms, fence
// segments along each wall with gates left open, the fence templates' repeat counts, the instance layer's fences
// (picks resolve to the wall), the indoor mask (no yard ceiling), the whole-house exterior's fences, and the tree.
// No browser or WebGL. Run: npm run yards:check
import { readFile } from "node:fs/promises";
import { Value } from "typebox/value";
import { Group, MeshStandardMaterial } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { addPathwayCommand, addYardCommand } from "@shared/domain/commands/areaCommands";
import { runCommand } from "@shared/domain/commands/command";
import { createFloor, createHouseDocument } from "@shared/domain/house/defaults";
import {
  createYard,
  fenceTemplates,
  groundFloorOf,
  isYard,
  lawnMaterial,
  pavingMaterial,
} from "@shared/domain/house/yards";
import { tallestWallMm } from "@shared/domain/house/floorPlacement";
import { House } from "@shared/domain/schemas/house";
import { Area } from "@shared/domain/schemas/area";
import { homeplanExtras, validateTemplateMetadata } from "@shared/domain/templates/metadata";
import { openingSizeFromParameters } from "@shared/domain/templates/openingSize";
import { buildFloorSlab, slabCoverage } from "@shared/geometry/floorSlab";
import { buildRealAllWalls } from "@shared/geometry/realAllWalls";
import { buildRealFloors } from "@shared/geometry/realFloor";
import { regionArea } from "@shared/geometry/region";
import { templateResize } from "@shared/geometry/templateResize";
import {
  fenceWallIdOf,
  floorFenceSegments,
  subtractIntervals,
  yardFenceSegments,
} from "@shared/geometry/yardFences";
import { fixtureRoom } from "./fixtures/multiStoreyHouse.ts";
import { createFloorScene } from "../src/renderer/floorScene.ts";
import { createHouseExterior } from "../src/renderer/houseExterior.ts";
import { createInstanceLayer } from "../src/renderer/instanceLayer.ts";
import { helperPalette } from "../src/renderer/helperPalette.ts";
import { flattenTemplate } from "../src/renderer/templateCache.ts";
import { buildHouseTree } from "../src/features/floor-builder/services/houseTree.ts";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === "" ? "" : `  (${detail})`}`);
};
const near = (a, b, tolerance = 0.5) => Math.abs(a - b) <= tolerance;
const floorOf = (areas, extra = {}) => ({ ...createFloor("Test"), ...extra, areas });

// ---- templates -----------------------------------------------------------------------------------

const loader = new GLTFLoader();
const assets = new Map();
for (const id of [...Object.values(fenceTemplates), "gate-picket", "gate-panel"]) {
  const bytes = await readFile(`server/builtin-templates/${id}/v1.glb`);
  const gltf = await loader.parseAsync(new Uint8Array(bytes).buffer, "");
  const validation = validateTemplateMetadata(homeplanExtras(gltf.scene.userData));
  check(`template ${id}: valid metadata`, validation.metadata !== null);
  if (validation.metadata !== null)
    assets.set(id, { metadata: validation.metadata, ...flattenTemplate(gltf) });
}
const templates = {
  get: (templateId) => {
    const asset = assets.get(templateId);
    return asset === undefined ? { state: "failed", reason: "unknown" } : { state: "ready", asset };
  },
  peek: (templateId) => {
    const asset = assets.get(templateId);
    return asset === undefined ? null : { state: "ready", asset };
  },
  dispose: () => undefined,
};
check(
  "templates: fences are Areable kind fence, gates Wallable kind gate",
  Object.values(fenceTemplates).every(
    (id) => assets.get(id)?.metadata.contract === "Areable" && assets.get(id)?.metadata.kind === "fence",
  ) &&
    ["gate-picket", "gate-panel"].every(
      (id) => assets.get(id)?.metadata.contract === "Wallable" && assets.get(id)?.metadata.kind === "gate",
    ),
);
const resized = (id, widthMm, heightMm) => {
  const asset = assets.get(id);
  return templateResize(asset.input, asset.metadata, { parameters: { widthMm, heightMm } });
};
for (const [id, widthMm, heightMm, node, count] of [
  ["fence-picket", 7000, 1000, "Pickets", 10],
  ["fence-picket", 350, 1000, "Pickets", 1],
  ["fence-panel", 9000, 1200, "Panel", 5],
  ["fence-hedge", 3000, 1600, "Run", 3],
  ["fence-slatted", 7800, 1800, "Slats", 4],
  ["fence-trellis", 350, 1000, "Lattice", 1],
  ["fence-wire", 9000, 1200, "Mesh", 5],
]) {
  const result = resized(id, widthMm, heightMm);
  check(
    `${id} at ${String(widthMm)} × ${String(heightMm)} mm: ${String(count)} × ${node}, exact size`,
    result.ok &&
      result.repeatCounts[node] === count &&
      near(result.sizeMm.x, widthMm) &&
      near(result.sizeMm.y, heightMm),
    result.ok ? `${String(result.repeatCounts[node])}, ${result.sizeMm.x} × ${result.sizeMm.y}` : "failed",
  );
}

// ---- schema --------------------------------------------------------------------------------------

const house = createHouseDocument("h_yardtest01", "Yard test");
const room = fixtureRoom("Living", { x: 3000, y: 2000 }, { width: 6000, depth: 4000 }, 2600);
house.floors[0].areas.push(room);
check("schema: a house without yards is valid (no migration)", Value.Check(House, house));
const upper = { ...createFloor("Upper", 2800), areas: [] };
house.floors.push(upper);

// ---- Add yard ------------------------------------------------------------------------------------

check("ground floor: the lowest by elevation", groundFloorOf(house.floors)?.id === house.floors[0].id);
const refused = runCommand(house, addYardCommand(house, upper.id, { x: 0, y: 0 }).command);
check("Add yard: refused above the ground floor", !refused.ok);
const added = addYardCommand(house, house.floors[0].id, { x: 0, y: 0 });
const outcome = runCommand(house, added.command);
check("Add yard: added on the ground floor and valid", outcome.ok && outcome.changed);
const withYard = outcome.ok ? outcome.document : house;
const yard = withYard.floors[0].areas.find((area) => area.id === added.areaId);
check("Add yard: a yard named Yard 1", yard !== undefined && isYard(yard) && yard.name === "Yard 1");
check(
  "Add yard: Lawn flooring",
  yard?.floor.material.pbrMetallicRoughness.baseColorTexture?.imageId ===
    lawnMaterial().pbrMetallicRoughness.baseColorTexture?.imageId,
);
const shape = yard?.floor.shapes[0];
// The room's RealFloor reaches y = 0 − 200 (outside-aligned 200 mm walls): the yard's north edge lies there.
check(
  "Add yard: 8 × 6 m against the south of the rooms, centred on them",
  shape?.type === "rectangle" &&
    shape.widthMm === 8000 &&
    shape.heightMm === 6000 &&
    near(yard.positionMm.x, 3000) &&
    near(yard.positionMm.y + 3000, -200),
  `${String(yard?.positionMm.x)}, ${String(yard?.positionMm.y)}`,
);
check(
  "Add yard: fences on three sides, none against the house",
  yard?.walls.length === 3 &&
    !yard.walls.some((wall) => wall.sourceEdge.edge === "top") &&
    yard.walls.every((wall) => wall.heightMm === 1000 && wall.alignment === "inside"),
);
check("schema: a house with a yard is valid", Value.Check(House, withYard));
for (const [style, templateId] of Object.entries(fenceTemplates)) {
  const styled = { ...yard, fence: style };
  check(
    `yard style ${style}: valid saved area and correct fence template`,
    Value.Check(Area, styled) &&
      yardFenceSegments(styled).every((segment) => segment.templateId === templateId),
  );
  // Gate slivers and very long boundaries use the same geometry path as whole panels. Verify real assets at
  // both ends of the supported length range, including finite normals/positions after the counted repeat.
  for (const widthMm of [50, 350, 6250, 100000]) {
    const result = resized(templateId, widthMm, 1300);
    check(
      `${templateId}: ${widthMm} mm stretch remains finite and exact`,
      result.ok &&
        near(result.sizeMm.x, widthMm) &&
        near(result.sizeMm.y, 1300) &&
        result.meshes.every((mesh) => [...mesh.positions, ...mesh.normals].every(Number.isFinite)),
    );
  }
}
check(
  "schema: an unknown area kind is refused",
  !Value.Check(House, {
    ...withYard,
    floors: [{ ...withYard.floors[0], areas: [{ ...room, kind: "garden" }] }, withYard.floors[1]],
  }),
);
check("tallest wall: yard fences do not count", tallestWallMm(withYard.floors[0], withYard) === 2600);

// A second yard goes south of the first one, fenced all round.
const second = addYardCommand(withYard, withYard.floors[0].id, { x: 0, y: 0 });
const secondOutcome = runCommand(withYard, second.command);
const secondYard = secondOutcome.ok
  ? secondOutcome.document.floors[0].areas.find((area) => area.id === second.areaId)
  : undefined;
check(
  "Add yard: a second yard south of the first, fenced all round",
  secondYard !== undefined &&
    near(secondYard.positionMm.y, yard.positionMm.y - 6000) &&
    secondYard.walls.length === 4,
  `${String(secondYard?.positionMm.y)}`,
);

// ---- Add pathway ---------------------------------------------------------------------------------

const pathway = addPathwayCommand(withYard, withYard.floors[0].id, added.areaId, { x: 0, y: 0 });
const pathOutcome = runCommand(withYard, pathway.command);
const path = pathOutcome.ok
  ? pathOutcome.document.floors[0].areas.find((area) => area.id === added.areaId)?.floor.carpets[0]
  : undefined;
check(
  "Add pathway: a carpet named Path 1 in built-in Paving",
  path?.name === "Path 1" &&
    path.material.pbrMetallicRoughness.baseColorTexture?.imageId ===
      pavingMaterial().pbrMetallicRoughness.baseColorTexture?.imageId,
);
check(
  "Add pathway: refused in a room",
  !runCommand(withYard, addPathwayCommand(withYard, withYard.floors[0].id, room.id, { x: 0, y: 0 }).command)
    .ok,
);

// ---- slab, RealAllWalls, RealFloor ---------------------------------------------------------------

const ground = withYard.floors[0];
const roomOnly = floorOf([room]);
check(
  "slab: the yard adds no coverage",
  near(regionArea(slabCoverage(ground)), regionArea(slabCoverage(roomOnly)), 1),
  `${regionArea(slabCoverage(ground))} vs ${regionArea(slabCoverage(roomOnly))}`,
);
check(
  "slab: a floor of yards alone has no slab",
  buildFloorSlab(floorOf([createYard("Y", { x: 0, y: 0 })])) === null,
);
const walls = buildRealAllWalls(ground, openingSizeFromParameters);
const yardWallIds = new Set(yard?.walls.map((wall) => wall.id));
check(
  "RealAllWalls: no yard wall bands, no intrusion issues",
  walls.bands.every((band) => !yardWallIds.has(band.wallId)) &&
    walls.bands.length > 0 &&
    !walls.issues.some((issue) => issue.kind === "intrusion"),
);
// A yard drawn around the room: its lawn is the yard minus the room and its walls.
const around = createYard("Around", { x: 3000, y: 2000 }, { widthMm: 10000, depthMm: 8000 });
const aroundFloors = buildRealFloors(floorOf([room, around]));
const roomSolid = 6400 * 4400;
check(
  "RealFloor: a yard around the house is clipped by the room's solid",
  near(regionArea(aroundFloors.get(around.id).region), 10000 * 8000 - roomSolid, 2) &&
    near(regionArea(aroundFloors.get(room.id).region), roomSolid, 2),
  `${regionArea(aroundFloors.get(around.id).region)}`,
);

// ---- fence segments ------------------------------------------------------------------------------

check(
  "intervals: a gate leaves two stretches",
  JSON.stringify(subtractIntervals([{ fromMm: 0, toMm: 8000 }], [{ fromMm: 3500, toMm: 4500 }], 50)) ===
    JSON.stringify([
      { fromMm: 0, toMm: 3500 },
      { fromMm: 4500, toMm: 8000 },
    ]),
);
const plain = yardFenceSegments(yard);
const bottom = plain.find(
  (segment) => segment.wallId === yard.walls.find((wall) => wall.sourceEdge.edge === "bottom")?.id,
);
check(
  "fences: one segment per fence wall, the wall's length and height, picket by default",
  plain.length === 3 &&
    bottom !== undefined &&
    near(bottom.widthMm, 8000) &&
    bottom.heightMm === 1000 &&
    bottom.templateId === "fence-picket",
);
check(
  "fences: on the band's middle line, facing into the yard",
  bottom !== undefined &&
    near(bottom.center.y, yard.positionMm.y - 3000 + 50) &&
    near(bottom.center.x, yard.positionMm.x) &&
    near(bottom.front.y, 1) &&
    near(bottom.front.x, 0),
  bottom === undefined ? "" : `${bottom.center.x}, ${bottom.center.y}`,
);
check(
  "fences: segment IDs name their wall",
  plain.every((segment) => fenceWallIdOf(segment.id) === segment.wallId),
);
check("fences: none for a room", yardFenceSegments(room).length === 0);
const gate = {
  id: "o_gate000001",
  name: "Gate",
  templateId: "gate-picket",
  templateVersion: 1,
  parameters: { widthMm: 1000, heightMm: 1000 },
  flip: { x: false, z: false },
  materialOverrides: {},
  placement: { distanceAlongWallMm: 2000, bottomMm: 0 },
};
const gated = {
  ...yard,
  fence: "hedge",
  walls: yard.walls.map((wall) => (wall.sourceEdge.edge === "bottom" ? { ...wall, objects: [gate] } : wall)),
};
const gatedBottom = yardFenceSegments(gated).filter((segment) => segment.wallId === bottom?.wallId);
check(
  "fences: a gate leaves its width open (two stretches, 1500 and 5500 mm), hedge style",
  gatedBottom.length === 2 &&
    near(gatedBottom[0].widthMm, 1500) &&
    near(gatedBottom[1].widthMm, 5500) &&
    gatedBottom.every((segment) => segment.templateId === "fence-hedge"),
  gatedBottom.map((segment) => segment.widthMm).join(", "),
);
check(
  "fences: a hidden wall has none",
  yardFenceSegments({ ...yard, walls: yard.walls.map((wall) => ({ ...wall, hidden: true })) }).length === 0,
);

// ---- renderer: instance layer, indoor mask, exterior ---------------------------------------------

const made = [];
const materials = {
  begin: () => undefined,
  get: () => {
    const material = new MeshStandardMaterial();
    made.push(material);
    return material;
  },
  sweep: () => undefined,
  setTexturesEnabled: () => undefined,
  dispose: () => undefined,
};
const mirrors = {
  material: (authored) => authored ?? new MeshStandardMaterial(),
  setReflectionScale: () => undefined,
  dispose: () => undefined,
};
const gatedHouse = {
  ...withYard,
  floors: [
    { ...ground, areas: ground.areas.map((area) => (area.id === yard.id ? gated : area)) },
    withYard.floors[1],
  ],
};
const gatedFloor = gatedHouse.floors[0];
const layer = createInstanceLayer(templates, materials, mirrors);
const group = new Group();
layer.sync(gatedFloor, openingSizeFromParameters, () => group);
const fenceRoots = group.children.filter((child) => child.name.includes("~fence~"));
check(
  "instance layer: one model per fence segment, plus the gate",
  fenceRoots.length === floorFenceSegments(gatedFloor).length &&
    group.children.some((child) => child.name === `instance:${gate.id}`),
  `${fenceRoots.length} fences, ${group.children.length} instances`,
);
const pick = [...layer.pickTargets().entries()].find(([mesh]) => {
  for (let current = mesh; current !== null; current = current.parent)
    if (current.name.includes("~fence~")) return true;
  return false;
});
const hit = pick?.[1]({ point: { x: 0, y: 0, z: 0 } });
check(
  "instance layer: a pick on a fence is a pick on its wall",
  hit?.kind === "wall" && hit.wallId === bottom?.wallId,
);
layer.setWallOpeningsVisible(false);
check(
  "instance layer: fences hide with Walls off",
  fenceRoots.every((root) => !root.visible),
);
layer.dispose();

const scene = createFloorScene(materials, helperPalette("light"));
scene.sync(gatedHouse, gatedFloor.id, openingSizeFromParameters);
const indoor = scene.indoorRooms().rooms.map((entry) => entry.areaId);
check(
  "indoor mask: the room is indoors, the yard is not",
  indoor.includes(room.id) && !indoor.includes(yard.id),
);
scene.dispose();

const exterior = createHouseExterior(materials, helperPalette("light"), 0x03a9f4, { templates, mirrors });
exterior.sync(gatedHouse, openingSizeFromParameters);
exterior.applyMaterials();
const exteriorNames = [];
exterior.root.traverse((child) => exteriorNames.push(child.name));
check(
  "exterior: fences and the gate are drawn",
  exteriorNames.filter((name) => name.includes("~fence~")).length === floorFenceSegments(gatedFloor).length &&
    exteriorNames.includes(`instance:${gate.id}`),
);
const frame = exterior.framePoints();
check(
  "exterior: framing reaches the yard's south fence",
  frame.some((point) => near(point.y, yard.positionMm.y - 3000 + 50, 1)),
);
exterior.dispose();
const bare = createHouseExterior(materials, helperPalette("light"), 0x03a9f4);
bare.sync(gatedHouse, openingSizeFromParameters);
const bareNames = [];
bare.root.traverse((child) => bareNames.push(child.name));
check(
  "exterior: without a template source, no fences (lawn only)",
  !bareNames.some((name) => name.includes("~fence~")),
);
bare.dispose();

// ---- tree ----------------------------------------------------------------------------------------

const tree = buildHouseTree(gatedHouse, { orphanWallIds: new Set(), flaggedIds: new Set() });
const [groundRow, upperRow] = tree.children ?? [];
const yardRow = groundRow?.children?.find((node) => node.id === yard.id);
check(
  "tree: Add yard on the ground floor only",
  groundRow?.addItems?.some((item) => item.id === "add:yard") === true &&
    upperRow?.addItems?.some((item) => item.id === "add:yard") === false,
);
check(
  "tree: a yard row with the yard icon, Pathway and Gate… menus, Fences row",
  yardRow?.icon === "yard" &&
    yardRow.children?.[0]?.addItems?.[0]?.id === "add:pathway" &&
    yardRow.children?.[1]?.label === "Fences" &&
    yardRow.children?.[1]?.children?.[0]?.addItems?.[0]?.id === "add:gate" &&
    !yardRow.addItems?.some((item) => item.id === "add:staircase"),
);

console.log(failures === 0 ? "\nAll yard checks passed." : `\n${String(failures)} yard check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
