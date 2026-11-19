// Contract/workflow checks using the real editor session, clients, geometry, schemas and template files.
// HTTP is an in-memory fixture; no existing house or backend is changed.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHouseDocument } from "../shared/domain/house/defaults.ts";
import { createId } from "../shared/domain/ids.ts";
import { compileValidator } from "../shared/domain/validation/ajv.ts";
import { createHttpClient } from "../src/api/httpClient.ts";
import { createHouseClient } from "../src/api/houseClient.ts";
import { createImageClient } from "../src/api/imageClient.ts";
import { createTemplateClient } from "../src/api/templateClient.ts";
import { createEditorSession } from "../src/features/floor-builder/services/editorSession.ts";
import { createAutomation } from "../src/features/floor-builder/automation/createAutomation.ts";
import { createHousesAutomation } from "../src/features/houses/automation/createHousesAutomation.ts";
import { setPropertyCommand } from "../shared/domain/commands/propertyCommands.ts";
import { createToolController } from "../src/features/floor-builder/tools/toolController.ts";
import { createInertRuntime } from "../src/renderer/inertRuntime.ts";

const templates = [];
for (const id of await readdir(new URL("../server/builtin-templates/", import.meta.url))) {
  const manifest = JSON.parse(
    await readFile(new URL(`../server/builtin-templates/${id}/template.json`, import.meta.url), "utf8"),
  );
  templates.push({
    id,
    label: manifest.label,
    kind: manifest.kind,
    contract: manifest.contract,
    versions: manifest.versions,
    source: "builtin",
    thumbnailUrl: null,
  });
}
const guides = await Promise.all(
  ["getting-started", "coordinates", "layout", "furnishing", "saving", "templates"].map(async (id) => ({
    id,
    title: id,
    markdown: await readFile(
      new URL(`../src/features/floor-builder/automation/guides/${id}.md`, import.meta.url),
      "utf8",
    ),
  })),
);
let assertions = 0;
const check = (label, fn) => {
  fn();
  assertions += 1;
  process.stdout.write(`✓ ${label}\n`);
};
let templateGate;
let revisionConflict = false;
let revisionCalls = 0;
let written;
let serverRevision = 0;
let revisionMessage;
const fetchFixture = async (url, options) => {
  const path = new URL(url).pathname;
  if (path.endsWith("/templates")) {
    if (templateGate) await templateGate;
    return Response.json({ templates });
  }
  if (path.endsWith("/images")) return Response.json({ images: [] });
  if (path.endsWith("/document") && options?.method === "PUT") {
    if (revisionConflict)
      return Response.json(
        { error: { code: "STALE_REVISION", message: "Fixture conflict" } },
        { status: 409 },
      );
    const body = JSON.parse(options.body);
    assert.equal(body.expectedRevision, serverRevision);
    written = body.document;
    return Response.json({ revision: ++serverRevision });
  }
  if (path.endsWith("/revisions")) {
    revisionCalls += 1;
    revisionMessage = JSON.parse(options.body).message;
    return Response.json({ created: false });
  }
  const match = /\/templates\/builtin\/([a-z0-9-]+)\/v\/(\d+)$/.exec(path);
  if (match) {
    const bytes = await readFile(
      new URL(`../server/builtin-templates/${match[1]}/v${match[2]}.glb`, import.meta.url),
    );
    return new Response(bytes, { headers: { "content-type": "model/gltf-binary" } });
  }
  throw new Error(`Unexpected fixture request: ${url}`);
};
const originalFetch = globalThis.fetch;
globalThis.fetch = fetchFixture;
const http = createHttpClient("http://agent-fixture.invalid/api", fetchFixture);
const house = createHouseDocument(createId("h"), "Agent fixture");
const session = createEditorSession(house.id, house, 0, createHouseClient(http));
const bridge = createAutomation(
  { session, images: createImageClient(http), templates: createTemplateClient(http) },
  guides,
);
const hp = bridge.api;
const state = () => session.documents.getState();
const call = async (name, input = {}) =>
  hp.callTool(name, { ...input, expectedGeneration: state().generation, requestId: crypto.randomUUID() });
const success = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.data;
};
const rejects = (result, code) => {
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.error.code, code);
};
const rectangle = {
  type: "rectangle",
  positionMm: { x: 0, y: 0 },
  rotationDeg: 0,
  widthMm: 4000,
  depthMm: 3000,
};
let editorToolCount;
try {
  const catalog = hp.describe();
  editorToolCount = catalog.tools.length;
  check("catalog contains callable paths, validated examples, schemas and Markdown guides", () => {
    assert.equal(catalog.apiVersion, "1");
    assert.equal(catalog.level, "editor");
    for (const tool of catalog.tools) {
      assert.equal(typeof hp.tools[tool.name], "function");
      assert.equal(tool.functionPath, `window.homeplan.tools.${tool.name}`);
      const validate = compileValidator(tool.inputSchema);
      for (const example of tool.examples)
        assert.equal(validate(example.input), true, `${tool.name}: ${JSON.stringify(validate.errors)}`);
      compileValidator(tool.outputSchema);
    }
    for (const guide of catalog.docs) assert.ok(hp.docs.read(guide.id).startsWith("#"));
    const name = catalog.tools[0].name;
    catalog.tools[0].name = "changed";
    assert.equal(hp.describe().tools[0].name, name);
  });
  const initial = await hp.tools.get_state();
  const floorId = success(initial).activeFloorId;
  success(initial).house.name = "Changed copy";
  check("read snapshots cannot mutate the document", () =>
    assert.equal(state().document.name, "Agent fixture"),
  );

  const first = success(
    await call("create_room", { floorId, name: "Kitchen", positionMm: { x: 0, y: 0 }, shape: rectangle }),
  );
  check("room and footprint commit together in one undo step", () => {
    assert.equal(session.history.getState().past.length, 1);
    assert.equal(state().document.floors[0].areas[0].floor.shapes[0].id, first.shapeId);
  });
  session.ui.setState({
    mode: "area",
    focusAreaId: first.areaId,
    selection: [first.shapeId],
    autoSelect: false,
    magnetic: false,
  });
  const noop = () => undefined;
  const controller = createToolController(
    session,
    {
      ...createInertRuntime("Agent manual-operation check"),
      worldUnitsPerPixel: () => 1,
      screenPointOf: ({ x, y }) => ({ x, y }),
      planPointAt: (x, y) => ({ x, y }),
    },
    { setOverlay: noop, setReadout: noop, setHint: noop, setCue: noop, setCursor: noop },
  );
  const press = {
    type: "pointer",
    phase: "down",
    button: 0,
    buttons: 1,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
    screen: { x: 2000, y: 0 },
    plan: { x: 2000, y: 0 },
    hit: { kind: "floor", areaId: first.areaId, pointMm: { x: 2000, y: 0, h: 0 } },
  };
  try {
    controller.pointer(press);
    check("Select resize publishes its active manual operation", () =>
      assert.equal(session.ui.getState().toolOperationActive, true),
    );
    rejects(await call("undo"), "BUSY");
    controller.pointer({ ...press, phase: "cancel", buttons: 0 });
    check("cancel clears the tool-operation guard without committing", () => {
      assert.equal(session.ui.getState().toolOperationActive, false);
      assert.equal(session.history.getState().past.length, 1);
    });
  } finally {
    controller.dispose();
    session.ui.setState({ mode: "overview", focusAreaId: undefined, selection: [] });
  }
  const second = success(
    await call("create_room", { floorId, name: "Dining", positionMm: { x: 4200, y: 0 }, shape: rectangle }),
  );
  const wallIds = success(await call("raise_walls", { areaId: first.areaId })).wallIds;
  success(await call("raise_walls", { areaId: second.areaId }));
  const generation = state().generation;
  const repeat = success(await call("raise_walls", { areaId: first.areaId }));
  check("raising walls again returns existing IDs without duplicates or history", () => {
    assert.deepEqual(repeat.wallIds, wallIds);
    assert.equal(state().generation, generation);
    assert.equal(state().document.floors[0].areas[0].walls.length, 4);
  });
  const geometry = success(await hp.tools.get_geometry({ floorId }));
  check("derived boundary/geometry inspection uses the authored rooms", () => {
    assert.equal(geometry.rooms.length, 2);
    assert.equal(geometry.rooms[0].boundaries.length, 4);
  });
  const rectangleSchema = success(await hp.tools.get_entity_schema({ entityId: first.shapeId })).schema;
  check("entity schema reports the authoritative rectangle depth name", () =>
    assert.ok(rectangleSchema.properties.heightMm),
  );
  const beforeInvalid = JSON.stringify(state().document);
  rejects(
    await call("create_room", {
      floorId,
      name: "Bad",
      positionMm: { x: 0, y: 0 },
      shape: { ...rectangle, widthMm: -1 },
    }),
    "INVALID_INPUT",
  );
  rejects(
    await call("create_room", {
      floorId,
      name: "Crossing",
      positionMm: { x: 0, y: 0 },
      shape: {
        type: "polygon",
        positionMm: { x: 0, y: 0 },
        rotationDeg: 0,
        vertices: [
          { x: 0, y: 0 },
          { x: 1000, y: 1000 },
          { x: 0, y: 1000 },
          { x: 1000, y: 0 },
        ],
      },
    }),
    "INVALID_INPUT",
  );
  rejects(
    await call("set_properties", {
      entityId: first.areaId,
      changes: [{ path: ["id"], value: "a_replaced" }],
    }),
    "INVALID_INPUT",
  );
  rejects(
    await call("set_properties", { entityId: first.areaId, changes: [{ path: ["floor"], value: {} }] }),
    "INVALID_INPUT",
  );
  rejects(
    await call("set_properties", {
      entityId: first.areaId,
      changes: [{ path: ["__proto__", "polluted"], value: true }],
    }),
    "INVALID_INPUT",
  );
  rejects(
    await call("set_properties", { entityId: first.shapeId, changes: [{ path: ["widthMm"], value: 0 }] }),
    "INVALID_INPUT",
  );
  check("invalid geometry, protected fields and prototype paths leave no changes", () => {
    assert.equal(JSON.stringify(state().document), beforeInvalid);
    assert.equal({}.polluted, undefined);
  });
  rejects(
    await hp.tools.create_room({
      floorId,
      name: "Missing control",
      positionMm: { x: 0, y: 0 },
      shape: rectangle,
    }),
    "INVALID_INPUT",
  );
  rejects(await hp.tools.undo({ expectedGeneration: 0, requestId: "stale" }), "STALE_GENERATION");
  rejects(await hp.tools.get_state({ surprise: true }), "INVALID_INPUT");
  rejects(await hp.tools.get_state({ value: Infinity }), "INVALID_INPUT");
  check("input schemas and stale generations are enforced", () =>
    assert.equal(JSON.stringify(state().document), beforeInvalid),
  );

  const idempotentInput = {
    areaId: first.areaId,
    name: "Ceiling",
    positionMm: { x: 0, y: 0 },
    elevationMm: 2300,
    expectedGeneration: state().generation,
    requestId: "one-light",
  };
  const [lightResult, duplicate] = await Promise.all([
    hp.tools.add_light(idempotentInput),
    hp.tools.add_light(idempotentInput),
  ]);
  const light = success(lightResult);
  const laterRetry = await hp.tools.add_light(idempotentInput);
  rejects(await hp.tools.add_light({ ...idempotentInput, name: "Different" }), "REQUEST_ID_REUSED");
  check("concurrent and later identical retries create exactly one light", () => {
    assert.deepEqual(lightResult, duplicate);
    assert.deepEqual(lightResult, laterRetry);
    assert.equal(state().document.floors[0].areas[0].lights.length, 1);
  });

  const historyBefore = session.history.getState().past.length;
  success(
    await call("batch", {
      label: "Two room names",
      operations: [
        {
          tool: "set_properties",
          input: { entityId: first.areaId, changes: [{ path: ["name"], value: "Cooking" }] },
        },
        {
          tool: "set_properties",
          input: { entityId: second.areaId, changes: [{ path: ["name"], value: "Eating" }] },
        },
      ],
    }),
  );
  check("batch commits once", () => assert.equal(session.history.getState().past.length, historyBefore + 1));
  success(await call("undo"));
  check("one Undo restores every batch operation", () =>
    assert.deepEqual(
      state().document.floors[0].areas.map((area) => area.name),
      ["Kitchen", "Dining"],
    ),
  );
  success(await call("redo"));
  const beforeRollback = JSON.stringify(state().document);
  const beforeHistory = session.history.getState().past.length;
  rejects(
    await call("batch", {
      label: "Rollback",
      operations: [
        {
          tool: "move_room",
          input: { areaId: first.areaId, positionMm: { x: 10000, y: 0 }, rotationDeg: 0 },
        },
        { tool: "move_room", input: { areaId: "a_missing1", positionMm: { x: 0, y: 0 }, rotationDeg: 0 } },
      ],
    }),
    "NOT_FOUND",
  );
  check("failed batch rolls back document and undo history", () => {
    assert.equal(JSON.stringify(state().document), beforeRollback);
    assert.equal(session.history.getState().past.length, beforeHistory);
  });
  const directOnly = await hp.tools.batch({
    label: "No save in batch",
    operations: [{ tool: "save", input: {} }],
    expectedGeneration: state().generation,
    requestId: "no-save-in-batch",
  });
  rejects(directOnly, "INVALID_INPUT");

  success(await hp.tools.list_templates());
  success(await hp.tools.list_images());
  const doorTemplate = templates.find((item) => item.kind === "door");
  const objectTemplate = templates.find((item) => item.id === "dining-table");
  assert.ok(doorTemplate);
  assert.ok(objectTemplate);
  const opening = success(
    await call("place_opening", {
      wallId: wallIds[0],
      templateId: doorTemplate.id,
      name: "Door",
      distanceAlongWallMm: 2000,
    }),
  );
  const object = success(
    await call("place_object", {
      areaId: first.areaId,
      templateId: objectTemplate.id,
      name: "Table",
      positionMm: { x: 0, y: 0 },
    }),
  );
  const objectSchema = success(await hp.tools.get_entity_schema({ entityId: object.objectId })).schema;
  check("real glTF template metadata supplies instance parameters and pinned versions", () => {
    assert.ok(objectSchema.properties.parameters.properties.widthMm);
    assert.equal(state().document.floors[0].areas[0].objects[0].templateVersion, 1);
    assert.equal(state().document.floors[0].areas[0].walls[0].objects[0].id, opening.openingId);
  });
  rejects(
    await call("place_object", {
      areaId: first.areaId,
      templateId: objectTemplate.id,
      name: "Bad table",
      positionMm: { x: 0, y: 0 },
      parameters: { widthMm: -50 },
    }),
    "INVALID_INPUT",
  );
  rejects(
    await call("set_properties", {
      entityId: object.objectId,
      changes: [{ path: ["templateVersion"], value: 999 }],
    }),
    "NOT_FOUND",
  );
  success(
    await call("set_properties", {
      entityId: object.objectId,
      changes: [{ path: ["parameters", "widthMm"], value: 1400 }],
    }),
  );
  const presets = success(await hp.tools.list_material_presets());
  success(
    await call("set_properties", {
      entityId: first.floorSurfaceId,
      changes: [{ path: ["material"], value: presets[0].material }],
    }),
  );
  const carpet = success(
    await call("add_carpet", { areaId: first.areaId, name: "Rug", positionMm: { x: 0, y: 0 } }),
  );
  success(
    await call("add_shape", {
      areaId: first.areaId,
      carpetId: carpet.carpetId,
      shape: { type: "circle", positionMm: { x: 1000, y: 0 }, radiusMm: 700 },
    }),
  );
  success(await call("delete_entities", { entityIds: [light.lightId] }));
  check("properties, materials, carpet shapes and deletion use the model commands", () => {
    assert.equal(state().document.floors[0].areas[0].objects[0].parameters.widthMm, 1400);
    assert.equal(state().document.floors[0].areas[0].floor.carpets[0].shapes.length, 2);
    assert.equal(state().document.floors[0].areas[0].lights.length, 0);
  });
  const newFloor = success(await call("create_floor", { name: "Upper" }));
  success(await call("set_view", { floorId: newFloor.floorId, mode: "3d" }));
  success(await call("delete_floor", { floorId: newFloor.floorId }));
  rejects(await call("delete_floor", { floorId }), "EDIT_REJECTED");
  check("floor commands retain one valid active floor", () =>
    assert.equal(session.ui.getState().activeFloorId, floorId),
  );

  for (const busy of ["tool", "preview", "placingLightId"]) {
    if (busy === "tool") session.ui.setState({ tool: "rectangle" });
    else if (busy === "preview") session.documents.setState({ preview: state().document });
    else session.ui.setState({ [busy]: "fixture" });
    rejects(await call("undo"), "BUSY");
    session.ui.setState({ tool: "select", placingLightId: undefined });
    session.documents.setState({ preview: undefined });
  }
  check("active manual operations are rejected without cancellation", () =>
    assert.equal(state().preview, undefined),
  );

  let release;
  templateGate = new Promise((resolve) => {
    release = resolve;
  });
  const raced = call("place_object", {
    areaId: first.areaId,
    templateId: objectTemplate.id,
    name: "Raced",
    positionMm: { x: 1000, y: 0 },
  });
  rejects(await call("undo"), "BUSY");
  const manual = session.execute(
    setPropertyCommand(state().document, [first.areaId], ["name"], "Manual name", "Manual rename"),
  );
  assert.equal(manual.ok, true);
  release();
  templateGate = undefined;
  rejects(await raced, "STALE_GENERATION");
  check("async preparation cannot overwrite intervening manual edits", () => {
    assert.equal(state().document.floors[0].areas[0].name, "Manual name");
    assert.equal(state().document.floors[0].areas[0].objects.length, 1);
  });

  const saveInput = {
    message: "Agent fixture revision",
    expectedGeneration: state().generation,
    requestId: "save-once",
  };
  success(await hp.tools.save(saveInput));
  success(await hp.tools.save(saveInput));
  check(
    "save uses full-JSON revision-aware clients and preserves the message; retries do not duplicate revisions",
    () => {
      assert.ok(written);
      assert.equal(written.floors[0].areas[0].name, "Manual name");
      assert.equal(revisionCalls, 1);
      assert.equal(revisionMessage, "Agent fixture revision");
      assert.equal(session.saves.getState().status, "saved");
    },
  );
  success(await call("move_room", { areaId: first.areaId, positionMm: { x: 10, y: 0 }, rotationDeg: 0 }));
  revisionConflict = true;
  rejects(await call("save"), "SAVE_FAILED");
  check("save conflicts preserve local edits and do not overwrite the server", () => {
    assert.equal(state().document.floors[0].areas[0].positionMm.x, 10);
    assert.equal(session.saves.getState().status, "conflict");
    assert.equal(revisionCalls, 1);
  });

  templateGate = new Promise((resolve) => {
    release = resolve;
  });
  const closing = call("place_object", {
    areaId: first.areaId,
    templateId: objectTemplate.id,
    name: "Closed",
    positionMm: { x: 0, y: 0 },
  });
  const retained = hp.tools.undo;
  const beforeClose = JSON.stringify(state().document);
  bridge.dispose();
  release();
  templateGate = undefined;
  rejects(await closing, "SESSION_CLOSED");
  rejects(await retained({ expectedGeneration: state().generation, requestId: "closed" }), "SESSION_CLOSED");
  check("disposal invalidates retained functions and in-flight edits", () => {
    assert.equal(JSON.stringify(state().document), beforeClose);
    assert.throws(() => hp.describe(), /closed/);
    assert.throws(() => hp.docs.read("layout"), /closed/);
  });
} finally {
  bridge.dispose();
  session.dispose();
  globalThis.fetch = originalFetch;
}

// Houses-level bridge (spec/architecture/browser-automation.md#houses-level-bridge) over an in-memory
// fixture of the house routes; no real house is listed, changed or trashed.
const houseCards = new Map();
const trashed = new Map();
const housesRequests = [];
let houseGate;
let releaseHouses;
const card = (id, name, revision = 0) => ({
  status: "ok",
  id,
  name,
  floorCount: 1,
  revision,
  modifiedAt: "2026-11-19T00:00:00.000Z",
});
const housesFetch = async (url, options = {}) => {
  const method = options.method ?? "GET";
  const path = new URL(url).pathname.replace(/^\/api/, "");
  const body = options.body === undefined ? {} : JSON.parse(options.body);
  housesRequests.push(`${method} ${path}`);
  if (houseGate) await houseGate;
  const missing = () =>
    Response.json({ error: { code: "NOT_FOUND", message: "Unknown house." } }, { status: 404 });
  if (method === "GET" && path === "/houses") return Response.json({ houses: [...houseCards.values()] });
  if (method === "GET" && path === "/trash/houses")
    return Response.json({
      houses: [...trashed.values()].map((house) => ({ house, trashedAt: "2026-11-19T00:00:00.000Z" })),
    });
  if (method === "POST" && path === "/houses") {
    const created = card(createId("h"), body.name);
    houseCards.set(created.id, created);
    return Response.json(created, { status: 201 });
  }
  let match = /^\/houses\/([^/]+)\/clone$/.exec(path);
  if (method === "POST" && match) {
    const source = houseCards.get(match[1]);
    if (!source) return missing();
    const copy = card(createId("h"), body.name ?? `${source.name} (copy)`);
    houseCards.set(copy.id, copy);
    return Response.json(copy, { status: 201 });
  }
  match = /^\/houses\/([^/]+)$/.exec(path);
  if (match && method === "PATCH") {
    const current = houseCards.get(match[1]);
    if (!current) return missing();
    if (body.expectedRevision !== current.revision)
      return Response.json({ error: { code: "STALE_REVISION", message: "Stale" } }, { status: 409 });
    const renamed = card(current.id, body.name, current.revision + 1);
    houseCards.set(renamed.id, renamed);
    return Response.json({ revision: renamed.revision, house: renamed });
  }
  if (match && method === "DELETE") {
    const current = houseCards.get(match[1]);
    if (!current) return missing();
    houseCards.delete(current.id);
    trashed.set(current.id, current);
    return new Response(null, { status: 204 });
  }
  match = /^\/trash\/houses\/([^/]+)\/restore$/.exec(path);
  if (match && method === "POST") {
    const current = trashed.get(match[1]);
    if (!current) return missing();
    trashed.delete(current.id);
    houseCards.set(current.id, current);
    return Response.json(current);
  }
  throw new Error(`Unexpected houses fixture request: ${method} ${path}`);
};
const housesGuides = [
  {
    id: "getting-started",
    title: "Managing houses",
    markdown: await readFile(
      new URL("../src/features/houses/automation/guides/getting-started.md", import.meta.url),
      "utf8",
    ),
  },
];
let changedCount = 0;
const opened = [];
const housesBridge = createHousesAutomation(
  {
    houses: createHouseClient(createHttpClient("http://houses-fixture.invalid/api", housesFetch)),
    onChanged: () => {
      changedCount += 1;
    },
    onOpen: (houseId) => {
      opened.push(houseId);
    },
  },
  housesGuides,
);
const hh = housesBridge.api;
try {
  const housesCatalog = hh.describe();
  const housesToolNames = housesCatalog.tools.map((tool) => tool.name);
  check("houses catalog: level, callable paths, validated examples, schemas, guide; no purge tool", () => {
    assert.equal(housesCatalog.apiVersion, "1");
    assert.equal(housesCatalog.level, "houses");
    assert.deepEqual(housesToolNames.sort(), [
      "clone_house",
      "create_house",
      "list_houses",
      "list_trash",
      "open_house",
      "rename_house",
      "restore_house",
      "trash_house",
    ]);
    assert.ok(!housesToolNames.some((name) => /purge|delete|empty/.test(name)));
    for (const tool of housesCatalog.tools) {
      assert.equal(typeof hh.tools[tool.name], "function");
      assert.equal(tool.functionPath, `window.homeplan.tools.${tool.name}`);
      const validate = compileValidator(tool.inputSchema);
      for (const example of tool.examples)
        assert.equal(validate(example.input), true, `${tool.name}: ${JSON.stringify(validate.errors)}`);
      compileValidator(tool.outputSchema);
      assert.equal(
        tool.effect === "resource",
        (tool.inputSchema.required ?? []).includes("requestId"),
        `${tool.name} requestId`,
      );
    }
    for (const guide of housesCatalog.docs) assert.ok(hh.docs.read(guide.id).startsWith("#"));
    assert.equal(hh.tools.purge_house, undefined);
  });
  rejects(await hh.callTool("purge_house", { houseId: "h_example1", requestId: "p" }), "NOT_FOUND");
  rejects(await hh.tools.create_house({ name: "No request ID" }), "INVALID_INPUT");
  rejects(await hh.tools.create_house({ name: "", requestId: "empty" }), "INVALID_INPUT");
  rejects(await hh.tools.list_houses({ surprise: true }), "INVALID_INPUT");
  rejects(await hh.tools.rename_house({ houseId: "../x", name: "Bad", requestId: "path" }), "INVALID_INPUT");
  check("houses inputs are schema-validated before any request", () => {
    assert.equal(housesRequests.length, 0);
    assert.equal(changedCount, 0);
  });

  const createInput = { name: "Agent fixture house", requestId: "create-once" };
  const [created, concurrent] = await Promise.all([
    hh.tools.create_house(createInput),
    hh.tools.create_house(createInput),
  ]);
  const later = await hh.tools.create_house(createInput);
  rejects(await hh.tools.create_house({ ...createInput, name: "Other" }), "REQUEST_ID_REUSED");
  const houseId = success(created).house.id;
  check("concurrent and later identical create retries create exactly one house and refresh once", () => {
    assert.deepEqual(created, concurrent);
    assert.deepEqual(created, later);
    assert.equal(houseCards.size, 1);
    assert.equal(changedCount, 1);
  });

  houseGate = new Promise((resolve) => {
    releaseHouses = resolve;
  });
  const slowClone = hh.tools.clone_house({ houseId, requestId: "clone-1" });
  rejects(await hh.tools.trash_house({ houseId, requestId: "trash-while-busy" }), "BUSY");
  releaseHouses();
  houseGate = undefined;
  const cloneId = success(await slowClone).house.id;
  const renamed = success(
    await hh.tools.rename_house({ houseId: cloneId, name: "Renamed", requestId: "r1" }),
  );
  rejects(await hh.tools.rename_house({ houseId: "h_missing00", name: "X", requestId: "r2" }), "NOT_FOUND");
  check("clone, rename (current revision) and one change at a time", () => {
    assert.equal(houseCards.get(cloneId).name, "Renamed");
    assert.equal(renamed.revision, 1);
    assert.equal(success(created).house.name, "Agent fixture house");
  });

  success(await hh.tools.trash_house({ houseId, requestId: "t1" }));
  success(await hh.tools.trash_house({ houseId, requestId: "t1" }));
  rejects(await hh.tools.trash_house({ houseId, requestId: "t1-again" }), "NOT_FOUND");
  const trashList = success(await hh.tools.list_trash());
  success(await hh.tools.restore_house({ houseId, requestId: "restore-1" }));
  check("trash retries are idempotent; trash lists and restore round-trip", () => {
    assert.deepEqual(
      trashList.houses.map((entry) => entry.house.id),
      [houseId],
    );
    assert.ok(houseCards.has(houseId));
    assert.equal(housesRequests.filter((entry) => entry === `DELETE /houses/${houseId}`).length, 2);
  });

  rejects(await hh.tools.open_house({ houseId: "h_missing00" }), "NOT_FOUND");
  const openResult = success(await hh.tools.open_house({ houseId }));
  check("open_house verifies the house and calls the navigation callback", () => {
    assert.deepEqual(opened, [houseId]);
    assert.equal(openResult.houseId, houseId);
  });

  houseGate = new Promise((resolve) => {
    releaseHouses = resolve;
  });
  const inFlight = hh.tools.trash_house({ houseId: cloneId, requestId: "closing" });
  const retainedList = hh.tools.list_houses;
  const changesBeforeClose = changedCount;
  housesBridge.dispose();
  releaseHouses();
  houseGate = undefined;
  rejects(await inFlight, "SESSION_CLOSED");
  rejects(await retainedList(), "SESSION_CLOSED");
  rejects(await hh.tools.open_house({ houseId }), "SESSION_CLOSED");
  check("houses disposal closes retained functions and suppresses refresh after close", () => {
    assert.equal(changedCount, changesBeforeClose);
    assert.deepEqual(opened, [houseId]);
    assert.throws(() => hh.describe(), /closed/);
    assert.throws(() => hh.docs.read("getting-started"), /closed/);
  });
  process.stdout.write(
    `${assertions} agent workflow/contract checks passed (${editorToolCount} editor tools, ${housesToolNames.length} houses tools).\n`,
  );
} finally {
  housesBridge.dispose();
}
