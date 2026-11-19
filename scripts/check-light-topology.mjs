// Stable light topology (Phase 16.6, spec/builder/features/lighting.md#stable-light-topology-phase-166): switching,
// dimming, or recolouring lights must not change what Three.js compiles its materials for, so the first switch is
// as fast as later ones. Builds the shared lights layer (src/renderer/lightsLayer.ts) for synthetic floors under
// and over the shadow budget and, for many on/off/brightness combinations, checks:
// - the topology key (visible point/spot lights, shadow casters per type, as WebGLLights hashes them; strip slots,
//   as stripShading.ts defines them) never changes under the shadow budget; over it, only the point/spot split of
//   the shadow slots may move, when the lights that are on need it (each new split compiles once; reported);
// - an off emitter has intensity 0 and does not redraw its shadow map, an on emitter does;
// - lights that are on look as before: their intensity does not depend on the others, and exactly the on emitters
//   the pre-16.6 rule gave a shadow (the brightest on emitters by flux, up to the budget) cast one.
// The whole house (Phase 18.1): one layer for every floor's lights (areas in their floors' groups) with the house
// budget keeps one topology across switches, casts exactly the brightest on emitters up to that budget, and goes
// back to the floor budget for a floor view.
// No browser or WebGL. Run: npm run lights:topology
import {
  Group,
  LineBasicMaterial,
  LineDashedMaterial,
  MeshBasicMaterial,
  PointLight,
  PointsMaterial,
  Scene,
  SpotLight,
} from "three";
import { createArea, createFloor } from "@shared/domain/house/defaults";
import { createLight } from "@shared/domain/commands/furnishingCommands";
import { effectiveLumens } from "../src/renderer/lightColor.ts";
import { createLightsLayer, houseShadowBudget, shadowBudget } from "../src/renderer/lightsLayer.ts";
import { floorWithLightsOff } from "../src/renderer/lightSwitch.ts";
import { linearStripPlan } from "../src/renderer/linearStrip.ts";
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === "" ? "" : `  (${detail})`}`);
};
const helperMaterials = {
  line: (_tone, dashed) => (dashed ? new LineDashedMaterial() : new LineBasicMaterial()),
  marker: () => new PointsMaterial(),
  fill: () => new MeshBasicMaterial(),
  setPalette: () => void 0,
  setDashScale: () => void 0,
  setPixelRatio: () => void 0,
  dispose: () => void 0,
};
const budget = shadowBudget(16);
const lightAt = (name, index, type, lumens) => {
  const base = createLight(name, { x: 600 + (index % 5) * 900, y: 600 + Math.floor(index / 5) * 900 });
  return {
    ...base,
    id: `l_${String(index).padStart(2, "0")}`,
    geometry: { ...base.geometry, type, lengthMm: type === "linear" ? 1800 : base.geometry.lengthMm },
    // A linear light at 1.2 m facing down: the strip term takes 85 % (floor rule), carriers the rest.
    elevationMm: type === "linear" ? 1200 : 2300,
    defaults: { ...base.defaults, outputLumens: lumens },
  };
};
const floorOf = (kinds) => {
  const area = {
    ...createArea("Room", { x: 0, y: 0 }),
    id: "a_room",
    lights: kinds.map((kind, index) =>
      lightAt(`Light ${String(index)}`, index, kind, 400 + ((index * 337) % 1400)),
    ),
  };
  return { ...createFloor("Ground"), id: "f_ground", areas: [area] };
};
const withStates = (floor, state) => ({
  ...floor,
  areas: floor.areas.map((area) => ({
    ...area,
    lights: area.lights.map((light, index) => {
      const next = state(light, index);
      return {
        ...light,
        defaults: { ...light.defaults, enabled: next.enabled, brightness: next.brightness },
      };
    }),
  })),
});
const emittersOf = (root) => {
  const found = [];
  root.traverse((object) => {
    if (object instanceof PointLight || object instanceof SpotLight) found.push(object);
  });
  return found;
};
const topologyKey = (scene, stripSlots) => {
  const count = { point: 0, spot: 0, pointShadows: 0, spotShadows: 0 };
  scene.traverseVisible((object) => {
    if (object instanceof PointLight) {
      count.point += 1;
      if (object.castShadow) count.pointShadows += 1;
    } else if (object instanceof SpotLight) {
      count.spot += 1;
      if (object.castShadow) count.spotShadows += 1;
    }
  });
  return `point ${String(count.point)}/${String(count.pointShadows)} spot ${String(count.spot)}/${String(
    count.spotShadows,
  )} strips ${String(stripSlots)}`;
};
const lightIdOf = (emitter) => emitter.name.replace(/^emitter:/, "").replace(/#\d+$/, "");
const previousCasters = (floor, emitters) => {
  const lights = new Map(floor.areas.flatMap((area) => area.lights.map((light) => [light.id, light])));
  const fluxOf = (emitter) => {
    const light = lights.get(lightIdOf(emitter));
    if (light === void 0) return 0;
    const lumens = effectiveLumens(light);
    if (light.geometry.type !== "linear") return lumens;
    const carriers = Math.min(3, Math.max(1, Math.round(light.geometry.lengthMm / 1500)));
    const share = linearStripPlan(light.elevationMm, 0, { x: 0, y: 0, z: -1 }, null).share;
    return (lumens * (1 - share)) / carriers;
  };
  const sampleOf = (emitter) => Number(/#(\d+)$/.exec(emitter.name)?.[1] ?? "0");
  return new Set(
    emitters
      .filter((emitter) => emitter.visible && fluxOf(emitter) > 0)
      .sort(
        (a, b) =>
          fluxOf(b) - fluxOf(a) || lightIdOf(a).localeCompare(lightIdOf(b)) || sampleOf(a) - sampleOf(b),
      )
      .slice(0, budget),
  );
};
const random = (seed) => {
  let state = seed;
  return () => {
    state = (state + 1831565813) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const runFloor = (label, kinds) => {
  const authored = floorOf(kinds);
  const scene = new Scene();
  const group = new Group();
  scene.add(group);
  const layer = createLightsLayer(helperMaterials, budget);
  const groupOf = (areaId) => (areaId === "a_room" ? group : null);
  const noFixtures = /* @__PURE__ */ new Map();
  const count = kinds.length;
  const rnd = random(166);
  const scenarios = [
    ["all on", authored],
    ["all off", withStates(authored, () => ({ enabled: false, brightness: 1 }))],
    ["lights toggle off", floorWithLightsOff(authored)],
    ["all at brightness 0", withStates(authored, () => ({ enabled: true, brightness: 0 }))],
  ];
  for (let index = 0; index < count; index += 1) {
    scenarios.push([
      `only ${String(index)} on`,
      withStates(authored, (_light, at) => ({ enabled: at === index, brightness: 1 })),
    ]);
    scenarios.push([
      `only ${String(index)} off`,
      withStates(authored, (_light, at) => ({ enabled: at !== index, brightness: 1 })),
    ]);
  }
  for (let round = 0; round < 40; round += 1)
    scenarios.push([
      `random ${String(round)}`,
      withStates(authored, () => ({ enabled: rnd() < 0.5, brightness: rnd() < 0.3 ? 0.1 + rnd() * 0.8 : 1 })),
    ]);
  const keys = /* @__PURE__ */ new Map();
  const fixedKeys = /* @__PURE__ */ new Set();
  let splitChanges = 0;
  let lastKey = null;
  let offFaults = 0;
  let onFaults = 0;
  let previousRuleDiffs = 0;
  let previousRuleScenarios = 0;
  let intensityFaults = 0;
  // withNeighbourSplits: each neighbouring split keeps the casters' total, moves the split by one, and is undone.
  let neighbourRuns = 0;
  let neighbourFaults = 0;
  let candidates = 0;
  const reference = /* @__PURE__ */ new Map();
  for (const [name, floor] of scenarios) {
    layer.sync(floor, groupOf, noFixtures);
    scene.updateMatrixWorld(true);
    const key = topologyKey(scene, layer.stripSlots());
    keys.set(key, [...(keys.get(key) ?? []), name]);
    if (lastKey !== null && key !== lastKey) splitChanges += 1;
    lastKey = key;
    const emitters = emittersOf(scene).filter((emitter) => emitter.visible);
    candidates = emitters.length;
    const casting = emitters.filter((emitter) => emitter.castShadow).length;
    fixedKeys.add(
      `${String(emittersOf(scene).filter((emitter) => emitter instanceof PointLight && emitter.visible).length)} ${String(emitters.length)} ${String(casting)} ${String(layer.stripSlots())}`,
    );
    for (const emitter of emitters) {
      const on = emitter.intensity > 0;
      if (!on && emitter.shadow.autoUpdate) offFaults += 1;
      if (on && !emitter.shadow.autoUpdate) onFaults += 1;
      if (name === "all on") reference.set(emitter.name, emitter.intensity);
      else if (on) {
        const light = floor.areas[0]?.lights.find((candidate) => candidate.id === lightIdOf(emitter));
        const full = light?.defaults.brightness === 1;
        if (full && reference.get(emitter.name) !== emitter.intensity) intensityFaults += 1;
      }
    }
    const before = emitters.map((emitter) => emitter.castShadow);
    const pointsCasting = (list) => list.filter((e) => e instanceof PointLight && e.castShadow).length;
    const pointsBefore = pointsCasting(emitters);
    layer.withNeighbourSplits(() => {
      neighbourRuns += 1;
      const total = emitters.filter((emitter) => emitter.castShadow).length;
      if (total !== casting || Math.abs(pointsCasting(emitters) - pointsBefore) !== 1) neighbourFaults += 1;
    });
    if (emitters.some((emitter, index) => emitter.castShadow !== before[index])) neighbourFaults += 1;
    const previous = previousCasters(floor, emitters);
    const differs = emitters.filter(
      (emitter) => emitter.intensity > 0 && previous.has(emitter) !== emitter.castShadow,
    ).length;
    if (differs > 0) {
      previousRuleDiffs += differs;
      previousRuleScenarios += 1;
    }
  }
  console.log(`
${label}: ${String(count)} lights, ${String(candidates)} drawn emitters, budget ${String(budget)}`);
  for (const [key, names] of keys) console.log(`  ${key}: ${String(names.length)} scenarios`);
  if (candidates <= budget)
    check(
      `${label}: one topology key across ${String(scenarios.length)} on/off/brightness scenarios`,
      keys.size === 1,
    );
  else {
    check(
      `${label}: lights, shadow casters, and strip slots fixed across ${String(scenarios.length)} scenarios`,
      fixedKeys.size === 1,
    );
    console.log(
      `INFO  ${label}: ${String(keys.size)} shadow splits seen (each compiles once), ${String(
        splitChanges,
      )} split changes in the sequence`,
    );
  }
  check(
    `${label}: off emitters do not redraw their shadow map`,
    offFaults === 0,
    `${String(offFaults)} faults`,
  );
  check(`${label}: on emitters redraw their shadow map`, onFaults === 0, `${String(onFaults)} faults`);
  check(
    `${label}: an on light's intensity does not depend on the other lights`,
    intensityFaults === 0,
    `${String(intensityFaults)} faults`,
  );
  check(
    `${label}: neighbouring shadow splits (${String(neighbourRuns)} precompile runs) are one step and undone`,
    neighbourFaults === 0 && candidates > budget === neighbourRuns > 0,
    `${String(neighbourFaults)} faults`,
  );
  check(
    `${label}: on emitters cast exactly as by the pre-16.6 rule`,
    previousRuleDiffs === 0,
    `${String(previousRuleDiffs)} differences in ${String(previousRuleScenarios)} scenarios`,
  );
  layer.dispose();
};
runFloor("under the budget", ["point", "point", "point", "point", "spot", "linear"]);
runFloor("over the budget", [
  "point",
  "point",
  "point",
  "point",
  "point",
  "point",
  "point",
  "point",
  "spot",
  "spot",
  "spot",
  "linear",
  "linear",
]);
// ---- the whole house (18.1) --------------------------------------------------------------------------------------
{
  const floors = ["ground", "first", "attic"].map((name, at) => {
    const area = {
      ...createArea(`Room ${name}`, { x: 0, y: 0 }),
      id: `a_${name}`,
      lights: Array.from({ length: 6 }, (_, index) =>
        lightAt(
          `${name} ${String(index)}`,
          index,
          index === 5 ? "spot" : "point",
          500 + (((at * 6 + index) * 211) % 1300),
        ),
      ).map((light, index) => ({ ...light, id: `l_${name}_${String(index)}` })),
    };
    return { ...createFloor(name), id: `f_${name}`, areas: [area] };
  });
  const scene = new Scene();
  const groups = new Map(
    floors.map((floor, at) => {
      const group = new Group();
      group.position.set(0, 0, at * 2900);
      scene.add(group);
      return [floor.areas[0].id, group];
    }),
  );
  const layer = createLightsLayer(helperMaterials, budget);
  layer.setShadowBudget(houseShadowBudget);
  const house = (states) => ({
    ...floors[0],
    areas: floors.map((floor) => withStates(floor, states).areas[0]),
  });
  const rnd = random(181);
  const keys = new Set();
  let ruleDiffs = 0;
  let casterFaults = 0;
  const emitterCount = floors.length * 6;
  for (let round = 0; round < 60; round += 1) {
    const floor = house(() => ({ enabled: round === 0 || rnd() < 0.4, brightness: rnd() < 0.3 ? 0.4 : 1 }));
    layer.sync(floor, (areaId) => groups.get(areaId) ?? null, new Map());
    scene.updateMatrixWorld(true);
    keys.add(topologyKey(scene, layer.stripSlots()).replace(/\/\d+/g, "/x"));
    const emitters = emittersOf(scene).filter((emitter) => emitter.visible);
    if (layer.shadowCasterCount() !== Math.min(houseShadowBudget, emitters.length)) casterFaults += 1;
    const lights = new Map(floor.areas.flatMap((area) => area.lights.map((light) => [light.id, light])));
    const on = emitters
      .filter((emitter) => emitter.intensity > 0)
      .sort((a, b) => {
        const la = lights.get(lightIdOf(a));
        const lb = lights.get(lightIdOf(b));
        return (
          (lb === undefined ? 0 : effectiveLumens(lb)) - (la === undefined ? 0 : effectiveLumens(la)) ||
          lightIdOf(a).localeCompare(lightIdOf(b))
        );
      });
    // Within each type the brightest on emitters cast (the split may hold fewer of one type).
    for (const type of [PointLight, SpotLight]) {
      const ofType = on.filter((emitter) => emitter instanceof type);
      const casting = ofType.filter((emitter) => emitter.castShadow).length;
      if (ofType.slice(0, casting).some((emitter) => !emitter.castShadow)) ruleDiffs += 1;
    }
  }
  check(
    `whole house: ${String(emitterCount)} lights on three floors keep one light count across 60 scenarios`,
    keys.size === 1,
    [...keys].join("; "),
  );
  check(
    `whole house: exactly ${String(houseShadowBudget)} shadow casters (the house budget) in every scenario`,
    casterFaults === 0,
    `${String(casterFaults)} faults`,
  );
  check(
    "whole house: the brightest on emitters of each type cast first",
    ruleDiffs === 0,
    `${String(ruleDiffs)} faults`,
  );
  layer.setShadowBudget(budget);
  layer.sync(
    house(() => ({ enabled: true, brightness: 1 })),
    (areaId) => groups.get(areaId) ?? null,
    new Map(),
  );
  check(
    "whole house: back to the floor budget, the floor's casters return",
    layer.shadowCasterCount() === Math.min(budget, emitterCount),
    String(layer.shadowCasterCount()),
  );
  check(
    "whole house: lights hang in their own floor's group",
    [...groups.values()].every((group) => group.children.length === 6),
  );
  layer.dispose();
}

console.log(
  failures === 0
    ? "\nAll light topology checks passed."
    : `
${String(failures)} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
