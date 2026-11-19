// Room picking, smart focus, and the reverse-dome funnel (Phases 8.1, 8.2a, 8.2): the pure parts
// of the HA viewer's room focus, checked on small fixed scenes. Run: npm run viewer:focus
import { HouseListResponse } from "@shared/contracts/houses";
import { House } from "@shared/domain/schemas/house";
import { openingSizeFromParameters } from "@shared/domain/templates/openingSize";
import { compileValidator } from "@shared/domain/validation/ajv";
import { buildRealAllWalls, buildRealAllWallsWithOpenings } from "@shared/geometry/realAllWalls";
import type { RealAllWalls } from "@shared/geometry/realAllWallsTypes";
import type { Region, Ring } from "@shared/geometry/region";
import { pointInRegion } from "@shared/geometry/region";
import { openingsInAreaBoundary } from "@shared/geometry/sharedOpenings";
import { roomBubbleLiftMm, roomFrame, rowCenters } from "../ha-viewer/bubbleLayout";
import { cameraAxes, fitFloor, frameFill } from "../ha-viewer/three/floorFraming";
import type { FramePoint, FrameWindow } from "../ha-viewer/three/floorFraming";
import { cutAmount, funnelFor, funnelHeight, ringDistance } from "../ha-viewer/three/cutawayFunnel";
import { chooseView, eyeOffsetMm, floorSamples, visibleShare } from "../ha-viewer/three/roomFocus";
import type { Occluder } from "../ha-viewer/three/roomVolumes";
import { nearestVolume, occluder, segmentBlocked, volumeEntry } from "../ha-viewer/three/roomVolumes";
import {
  chosenCorners,
  cornerNear,
  defaultCorners,
  ringCorners,
  sweepAxis,
  sweepPulse,
  sweepSource,
  toggleCorner,
} from "../ha-viewer/three/sweepGeometry";

let failures = 0;
const check = (name: string, ok: boolean, detail = ""): void => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === "" ? "" : `  (${detail})`}`);
};

const rect = (minX: number, minY: number, maxX: number, maxY: number): Ring => [
  { x: minX, y: minY },
  { x: maxX, y: minY },
  { x: maxX, y: maxY },
  { x: minX, y: maxY },
];
const region = (ring: Ring): Region => ({ polygons: [{ outer: ring, holes: [] }] });
const deg = Math.PI / 180;

// ---- 8.1 room volumes ---------------------------------------------------------------------------------
{
  const near = { areaId: "near", region: region(rect(0, 0, 4000, 4000)), bottomMm: 0, topMm: 2750 };
  const far = { areaId: "far", region: region(rect(0, 4000, 4000, 8000)), bottomMm: 0, topMm: 2750 };
  // A camera south of the house, looking north and down over the near room (clearing its walls) at the far one.
  const origin = { x: 2000, y: -6000, h: 8000 };
  const towardFar = { origin, direction: { x: 0, y: 12000, h: -6000 } };
  check(
    "ray over the near room enters the far room",
    nearestVolume([near, far], towardFar)?.areaId === "far",
  );
  const towardNear = { origin, direction: { x: 0, y: 8000, h: -8000 } };
  check(
    "ray into the near room picks the near room",
    nearestVolume([near, far], towardNear)?.areaId === "near",
  );
  const sky = { origin, direction: { x: 0, y: 1000, h: 1000 } };
  check("ray into the sky misses every room", nearestVolume([near, far], sky) === null);
  const inside = { origin: { x: 1000, y: 1000, h: 1000 }, direction: { x: 1, y: 0, h: 0 } };
  check("ray starting inside a volume enters at once", volumeEntry(near, inside) === 0);
  // An exterior wall's face (the band lies inside its room's floor shape): the hit point is inside that volume.
  const wallFace = { origin: { x: 2000, y: -3000, h: 1500 }, direction: { x: 0, y: 1, h: 0 } };
  check("ray onto an exterior wall enters its room", nearestVolume([near, far], wallFace)?.areaId === "near");
}

// ---- line of sight ------------------------------------------------------------------------------------
{
  const wall = occluder(rect(0, 0, 4000, 200), 0, 2700);
  check(
    "a wall blocks a low line of sight",
    segmentBlocked({ x: 2000, y: -3000, h: 1500 }, { x: 2000, y: 2000, h: 100 }, wall),
  );
  check(
    "a line of sight over the wall is clear",
    !segmentBlocked({ x: 2000, y: -3000, h: 9000 }, { x: 2000, y: 2000, h: 100 }, wall),
  );
}

// ---- 8.2 smart focus ----------------------------------------------------------------------------------
{
  // A 3 × 2.4 m utility room: tall walls on all four sides (200 mm thick, inside its floor shape).
  const t = 200;
  const room = rect(0, 0, 3000, 2400);
  const walls: Occluder[] = [
    occluder(rect(0, 0, 3000, t), 0, 2700),
    occluder(rect(0, 2400 - t, 3000, 2400), 0, 2700),
    occluder(rect(0, 0, t, 2400), 0, 2700),
    occluder(rect(3000 - t, 0, 3000, 2400), 0, 2700),
  ];
  const samples = floorSamples(region(room), walls);
  check(
    "floor samples avoid the walls",
    samples.length > 10 && samples.every((p) => p.x > t && p.x < 3000 - t),
  );
  const target = { x: 1500, y: 1200, h: 1200 };
  const from = { azimuth: 35 * deg, polar: 62 * deg };
  const limits = { minPolar: 10 * deg, maxPolar: 80 * deg };
  const eyeAt = (view: { azimuth: number; polar: number }): { x: number; y: number; h: number } => {
    const offset = eyeOffsetMm(view, 8);
    return { x: target.x + offset.x, y: target.y + offset.y, h: target.h + offset.h };
  };
  const before = visibleShare(eyeAt(from), samples, walls);
  const choice = chooseView({ target, distanceM: 8, from, limits, samples, occluders: walls });
  check(
    "the utility room is seen better than from the current angle",
    choice !== null && choice.visible > before + 0.2,
    `before ${before.toFixed(2)}, after ${choice?.visible.toFixed(2) ?? "none"}`,
  );
  check("…by looking more from above", choice !== null && choice.view.polar < from.polar);

  // A room with one tall wall (south, toward the camera) and low walls elsewhere: turning round beats it.
  const openWalls: Occluder[] = [
    occluder(rect(0, 0, 4000, t), 0, 2700),
    occluder(rect(0, 3000 - t, 4000, 3000), 0, 300),
  ];
  const openSamples = floorSamples(region(rect(0, 0, 4000, 3000)), openWalls);
  const southFrom = { azimuth: 0, polar: 75 * deg };
  const southTarget = { x: 2000, y: 1500, h: 1200 };
  const turned = chooseView({
    target: southTarget,
    distanceM: 8,
    from: southFrom,
    limits,
    samples: openSamples,
    occluders: openWalls,
  });
  check(
    "a blocked view changes",
    turned !== null && (turned.view.azimuth !== 0 || turned.view.polar !== southFrom.polar),
  );
  const southEye = eyeOffsetMm(southFrom, 8);
  check("azimuth 0 is south of the target (plan −y)", southEye.y < 0 && Math.abs(southEye.x) < 1e-6);

  // Nothing in the way: the current view stays (smallest turn).
  const clear = chooseView({
    target: southTarget,
    distanceM: 8,
    from: { azimuth: 35 * deg, polar: 62 * deg },
    limits,
    samples: openSamples,
    occluders: [],
  });
  check(
    "an unobstructed room keeps the current angle",
    clear !== null && clear.turn === 0,
    `turn ${clear?.turn.toFixed(3) ?? "none"}`,
  );
}

// ---- 8.2a reverse-dome funnel -------------------------------------------------------------------------
{
  check(
    "ring distance from the centre is the radius",
    Math.abs(ringDistance(0, 0, 1, 0, 0, 0, 5) - 5) < 1e-9,
  );
  const input = {
    roomFloorCenter: { x: 0, y: 0, z: 0 },
    houseCenterX: 0,
    houseCenterZ: 0,
    houseRadius: 6,
    wallTopY: 2.7,
    // A camera 28° above the horizon, 10 m south (world +z).
    eye: { x: 0, y: 10 * Math.tan(28 * deg), z: 10 },
  };
  const funnel = funnelFor(input);
  check("the floor at the apex is kept", cutAmount(funnel, { x: 0, y: 0, z: 0 }) === 0);
  check("a wall top next to the room is cut", cutAmount(funnel, { x: 0, y: 2.5, z: 2 }) === 1);
  check("a point beyond the ring is kept", funnelHeight(funnel, 0, -20) === null);
  check("a low point far from the room is kept", cutAmount(funnel, { x: 5, y: 0.3, z: -5 }) === 0);
  // Every point on the line of sight from the eye to the apex, up to wall-top height, is cut.
  let clearSight = true;
  for (let step = 1; step < 20; step += 1) {
    const f = step / 20;
    const point = { x: 0, y: input.eye.y * f + 0.06, z: input.eye.z * f };
    if (point.y > 2.7 || point.y < 0.3) continue;
    if (cutAmount(funnel, point) === 0) clearSight = false;
  }
  check("the line of sight from a 28° camera is clear", clearSight);
  const shifted = funnelFor({ ...input, houseRadius: 2 });
  check(
    "a small house ring reaches toward a low camera",
    shifted.ringCenterZ > 0 &&
      ringDistance(0, 0, 0, 1, shifted.ringCenterX, shifted.ringCenterZ, shifted.ringRadius) >=
        (shifted.topY - shifted.apex.y) / Math.tan(28 * deg) - 1e-6,
  );
}

// ---- 8.6 intrusion sweeps ------------------------------------------------------------------------------
{
  // A 4 × 3 m room; its walls are 200 mm bands outside the outline (outside alignment).
  const ring = rect(0, 0, 4000, 3000);
  check("a rectangle has four corners", ringCorners(ring).length === 4);
  const withMidpoint: Ring = [
    { x: 0, y: 0 },
    { x: 2000, y: 0 },
    { x: 4000, y: 0 },
    { x: 4000, y: 3000 },
    { x: 0, y: 3000 },
  ];
  check("a straight run is no corner", ringCorners(withMidpoint).length === 4);
  const first = ringCorners(ring)[0];
  check(
    "the bisector points into the room",
    first !== undefined && first.inward.x > 0.6 && first.inward.y > 0.6,
    JSON.stringify(first?.inward),
  );
  const clockwise = ringCorners([...ring].reverse())[0];
  check(
    "a clockwise ring gives inward bisectors too",
    clockwise !== undefined &&
      clockwise.inward.x * (2000 - clockwise.point.x) + clockwise.inward.y * (1500 - clockwise.point.y) > 0,
  );
  const corners = ringCorners(ring).map((corner) => ({
    local: corner.point,
    plan: corner.point,
    inward: corner.inward,
  }));
  const room = {
    areaId: "a",
    corners,
    outline: ring,
    bands: [rect(-200, -200, 4200, 0), rect(-200, 0, 0, 3200)],
    doors: [{ x: 2000, y: 0 }],
    sensorMm: 2250,
    diagonalMm: 5000,
  };
  const byDoor = defaultCorners(corners, room.doors).map((corner) => `${corner.plan.x},${corner.plan.y}`);
  check(
    "default corners: the two farthest from the door",
    byDoor.includes("4000,3000") && byDoor.includes("0,3000"),
    byDoor.join(" "),
  );
  const noDoor = defaultCorners(corners, []).map((corner) => `${corner.plan.x},${corner.plan.y}`);
  check(
    "default corners without a door: opposite corners",
    (noDoor.includes("0,0") && noDoor.includes("4000,3000")) ||
      (noDoor.includes("4000,0") && noDoor.includes("0,3000")),
    noDoor.join(" "),
  );
  check("no stored corners: the defaults", chosenCorners(room, undefined).length === 2);
  check("an empty list sweeps from none", chosenCorners(room, []).length === 0);
  const matched = chosenCorners(room, [
    { x: 3900, y: 120 },
    { x: 2000, y: 1500 },
  ]);
  check(
    "stored corners match within the tolerance; others drop",
    matched.length === 1 && matched[0]?.plan.x === 4000 && matched[0].plan.y === 0,
  );
  const origin = corners.find((corner) => corner.plan.x === 0 && corner.plan.y === 0);
  if (origin !== undefined) {
    const added = toggleCorner(matched, origin);
    check("a tap adds a corner", added.length === 2);
    const removed = toggleCorner(chosenCorners(room, added), origin);
    check("a second tap removes it", removed.length === 1);
    const source = sweepSource(room, origin);
    check(
      "the sensor sits inside the walls, at sensor height",
      source.position.x > 0 && source.position.y > 0 && source.position.h === 2250,
      JSON.stringify(source.position),
    );
    const restAxis = sweepAxis(source, 0, 0, true);
    let widest = 0;
    for (let t = 0; t <= 8000; t += 100) {
      const axis = sweepAxis(source, 0, t, false);
      const turn = Math.acos(
        Math.min(
          1,
          (axis.x * restAxis.x + axis.y * restAxis.y) /
            (Math.hypot(axis.x, axis.y) * Math.hypot(restAxis.x, restAxis.y)),
        ),
      );
      widest = Math.max(widest, turn);
    }
    check("the cone sweeps ±35°", Math.abs(widest - 35 * deg) < 1 * deg, `${(widest / deg).toFixed(1)}°`);
    check("the cone points down into the room", restAxis.h < 0 && restAxis.x > 0 && restAxis.y > 0);
    check(
      "reduced motion: a still cone and a steady pulse",
      JSON.stringify(sweepAxis(source, 0, 2000, true)) === JSON.stringify(restAxis) &&
        sweepPulse(900, true) === 1,
    );
  }
  check(
    "a tap picks the nearest marker within reach",
    cornerNear(
      [
        { item: "a", screen: { x: 100, y: 100 } },
        { item: "b", screen: { x: 120, y: 100 } },
        { item: "c", screen: null },
      ],
      { x: 115, y: 102 },
    ) === "b",
  );
  check(
    "a tap far from every marker picks none",
    cornerNear([{ item: "a", screen: { x: 100, y: 100 } }], { x: 300, y: 100 }) === null,
  );
}

// ---- 8.5 room bubble layout ---------------------------------------------------------------------------
{
  const wide = roomFrame(region(rect(0, 0, 6000, 3000)), 2600);
  check(
    "room bubbles: centred above a wide room",
    wide !== null && Math.abs(wide.center.x - 3000) < 1e-6 && Math.abs(wide.center.y - 1500) < 1e-6,
    JSON.stringify(wide?.center),
  );
  check("room bubbles: above the wall tops", wide?.center.h === 2600 + roomBubbleLiftMm);
  check("room bubbles: along the long side (x)", wide !== null && Math.abs(wide.axis.x - 1) < 1e-9);
  const deep = roomFrame(region(rect(0, 0, 2000, 5000)), 2600);
  check("room bubbles: along the long side (y)", deep !== null && Math.abs(deep.axis.y - 1) < 1e-9);
  const centers = rowCenters({ x: 100, y: 50 }, { x: 10, y: 0 }, [
    { width: 40, height: 30 },
    { width: 60, height: 30 },
  ]);
  check(
    "room bubbles: row centred on screen",
    centers.length === 2 &&
      Math.abs((centers[0]?.x ?? 0) - (100 - 54 + 20)) < 1e-6 &&
      Math.abs((centers[1]?.x ?? 0) - (100 + 54 - 30)) < 1e-6,
    JSON.stringify(centers),
  );
  const flipped = rowCenters({ x: 0, y: 0 }, { x: -1, y: 0 }, [
    { width: 20, height: 20 },
    { width: 20, height: 20 },
  ]);
  check("room bubbles: row reads left to right", (flipped[0]?.x ?? 0) < (flipped[1]?.x ?? 0));
  const vertical = rowCenters({ x: 0, y: 0 }, { x: 0, y: 0 }, [{ width: 20, height: 20 }]);
  check("room bubbles: degenerate direction is horizontal", vertical[0]?.x === 0 && vertical[0].y === 0);
}

// ---- 14.3 whole-floor framing ---------------------------------------------------------------------------
{
  const elevation = 52 * deg;
  const azimuth = 35 * deg;
  const tan = Math.tan(17.5 * deg);
  const box = (width: number, depth: number, height: number): FramePoint[] => {
    const points: FramePoint[] = [];
    for (const x of [-width / 2, width / 2])
      for (const y of [-height / 2, height / 2])
        for (const z of [-depth / 2, depth / 2]) points.push({ x, y, z });
    return points;
  };
  // The free window as the viewer builds it: the insets' share, the target 5 % of the height low.
  const windowOf = (aspect: number, across: number, upright: number): FrameWindow => ({
    left: tan * aspect * across,
    right: tan * aspect * across,
    bottom: tan * upright * 0.9,
    top: tan * upright * 1.1,
  });
  // The box fit it replaces: symmetric about the box centre, 4 % farther.
  const boxFit = (points: readonly FramePoint[], free: FrameWindow): number => {
    const axes = cameraAxes(elevation, azimuth);
    const dot = (a: FramePoint, b: FramePoint): number => a.x * b.x + a.y * b.y + a.z * b.z;
    let distance = 1;
    for (const point of points) {
      const toward = dot(point, axes.back);
      distance = Math.max(
        distance,
        toward + Math.abs(dot(point, axes.right)) / free.right,
        toward + Math.abs(dot(point, axes.up)) / ((free.top + free.bottom) / 2),
      );
    }
    return distance * 1.04;
  };
  /** Every point inside the filled window, and the tightest side within 1 % of its edge. */
  const inside = (points: readonly FramePoint[], free: FrameWindow): { fits: boolean; touches: boolean } => {
    const fit = fitFloor(points, elevation, azimuth, free);
    const axes = cameraAxes(elevation, azimuth);
    const dot = (a: FramePoint, b: FramePoint): number => a.x * b.x + a.y * b.y + a.z * b.z;
    let fits = true;
    let fill = 0;
    for (const point of points) {
      const depth = fit.distance - dot(point, axes.back);
      const x = (dot(point, axes.right) - fit.shiftRight) / depth;
      const y = (dot(point, axes.up) - fit.shiftUp) / depth;
      const sides = [-x / free.left, x / free.right, -y / free.bottom, y / free.top];
      fill = Math.max(fill, ...sides);
      if (sides.some((side) => side > frameFill + 1e-6)) fits = false;
    }
    return { fits, touches: fill > frameFill * 0.99 };
  };
  const screens: readonly [string, number][] = [
    ["wide", 16 / 9],
    ["square", 1],
    ["narrow", 0.6],
  ];
  const insetCases: readonly [string, number, number][] = [
    ["no widgets", 1, 1],
    ["side widgets", 0.7, 1],
    ["top or bottom widgets", 1, 0.65],
  ];
  for (const [screen, aspect] of screens)
    for (const [widgets, across, upright] of insetCases)
      for (const [name, points] of [
        ["10 × 10 m", box(10, 10, 3)],
        ["15 × 8 m", box(15, 8, 2.7)],
      ] as const) {
        const result = inside(points, windowOf(aspect, across, upright));
        check(
          `floor framing: ${name} unclipped and tight, ${screen} screen, ${widgets}`,
          result.fits && result.touches,
        );
      }
  const wide = windowOf(16 / 9, 1, 1);
  const closer = boxFit(box(12, 9, 2.7), wide) / fitFloor(box(12, 9, 2.7), elevation, azimuth, wide).distance;
  check("floor framing: wide screen about 15–20 % closer than the box fit", closer > 1.15, closer.toFixed(3));
  // An L-shaped house: its outline frames closer than its bounding box.
  const lShape: FramePoint[] = [];
  for (const [x, z] of [
    [-6, -6],
    [6, -6],
    [6, 0],
    [0, 0],
    [0, 6],
    [-6, 6],
  ] as const)
    for (const y of [-1.35, 1.35]) lShape.push({ x, y, z });
  const lFit = fitFloor(lShape, elevation, azimuth, wide).distance;
  const lBox = fitFloor(box(12, 12, 2.7), elevation, azimuth, wide).distance;
  check(
    "floor framing: an L-shaped outline frames no farther than its box",
    lFit <= lBox + 1e-6,
    `${lFit.toFixed(2)} ≤ ${lBox.toFixed(2)}`,
  );
  const centred = fitFloor(box(10, 10, 3), elevation, azimuth, windowOf(0.6, 1, 1));
  check(
    "floor framing: a narrow screen keeps the target on the box centre vertically",
    Math.abs(centred.shiftUp) < 1e-9,
  );
}

// ---- 15.7 shared-wall openings on a demo house ------------------------------------------------------
// The "Demo: City apartment" house, read from the dev API (HOMEPLAN_URL, default http://localhost:4310); skipped
// when the server is not running or the demo house does not exist (npm run seed:demo-houses).
{
  const base = process.env.HOMEPLAN_URL ?? "http://localhost:4310";
  const demoName = "Demo: City apartment";
  const readJson = (url: string): Promise<unknown> =>
    fetch(url)
      .then((response): Promise<unknown> | null => (response.ok ? response.json() : null))
      .catch(() => null);
  const validList = compileValidator(HouseListResponse);
  const validHouse = compileValidator(House);
  const list = await readJson(`${base}/api/houses`);
  const card = validList(list)
    ? list.houses.find((item) => item.status === "ok" && item.name === demoName)
    : undefined;
  const body = card === undefined ? null : await readJson(`${base}/api/houses/${card.id}/document`);
  const house = typeof body === "object" && body !== null && "document" in body ? body.document : null;
  const floor = validHouse(house) ? house.floors[0] : undefined;
  if (floor === undefined) console.log(`SKIP  15.7 demo house (${demoName} not readable at ${base})`);
  else {
    const walls = buildRealAllWalls(floor, openingSizeFromParameters);
    const blockedAt1m = (part: RealAllWalls, cuts: RealAllWalls["openings"]): number =>
      cuts.filter((prism) => {
        const slice = part.slices.find((candidate) => candidate.bottomMm <= 1000 && 1000 < candidate.topMm);
        const n = prism.footprint.length;
        const center = {
          x: prism.footprint.reduce((sum, point) => sum + point.x, 0) / n,
          y: prism.footprint.reduce((sum, point) => sum + point.y, 0) / n,
        };
        return slice !== undefined && pointInRegion(center, slice.footprint);
      }).length;
    let sharedTotal = 0;
    // Doorways a room's walls close when the room is shown alone (rooms without a wall on the shared edge, such
    // as a balcony against the living room, close none).
    let closedAlone = 0;
    for (const area of floor.areas) {
      const shared = openingsInAreaBoundary(walls, area);
      const own = new Set(area.walls.flatMap((wall) => wall.objects.map((object) => object.id)));
      sharedTotal += shared.size;
      check(
        `15.7: ${area.name} lists only neighbours' openings in its shared walls, never its own`,
        [...shared.keys()].every((id) => !own.has(id)),
      );
      if (shared.size === 0) continue;
      // The room alone closes its neighbours' doorways; its own layer, cut by them, keeps them open.
      const cuts = walls.openings.filter((prism) => shared.has(prism.openingId));
      const plain = buildRealAllWalls({ ...floor, areas: [area] }, openingSizeFromParameters);
      const alone = buildRealAllWallsWithOpenings(
        { ...floor, areas: [area] },
        openingSizeFromParameters,
        cuts,
      );
      closedAlone += blockedAt1m(plain, cuts);
      check(`15.7: ${area.name}'s own layer keeps the shared doorways open`, blockedAt1m(alone, cuts) === 0);
    }
    check(
      "15.7: the demo house has openings in shared walls (the checks above are not empty)",
      sharedTotal > 0,
    );
    check(
      "15.7: some room alone closes a shared doorway (the case its own layer must reopen)",
      closedAlone > 0,
    );
  }
}

console.log(failures === 0 ? "\nAll room focus checks passed." : `\n${failures} check(s) failed.`);
if (failures > 0) process.exitCode = 1;
