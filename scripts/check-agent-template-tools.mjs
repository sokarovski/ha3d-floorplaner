// End-to-end template wrapper checks against the actual backend via Fastify.inject and temporary storage.
// No listening socket, browser, external network, or installation data is involved.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { buildApp } from "../server/app.ts";
import { createHttpClient } from "../src/api/httpClient.ts";
import { createHouseClient } from "../src/api/houseClient.ts";
import { createTemplateClient } from "../src/api/templateClient.ts";
import { createImageClient } from "../src/api/imageClient.ts";
import { createEditorSession } from "../src/features/floor-builder/services/editorSession.ts";
import { createAutomation } from "../src/features/floor-builder/automation/createAutomation.ts";

const dataDir = await mkdtemp(join(tmpdir(), "homeplan-agent-templates-"));
const app = await buildApp({
  dataDir,
  host: "localhost",
  port: 4339,
  basePath: "/agent-test/",
  production: false,
  clientDir: join(dataDir, "unused-client"),
});
const originalFetch = globalThis.fetch;
let bridge;
let session;
let uploadGate;
let uploadStarted;
let releaseUpload;
let failVersion = false;
let uploads = 0;
let saves = 0;
let refreshes = 0;
let checks = 0;
const check = (label, fn) => {
  fn();
  checks += 1;
  process.stdout.write(`✓ ${label}\n`);
};
const success = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.data;
};
const rejected = (result, code) => {
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.error.code, code);
};
try {
  const fetchFixture = async (url, options = {}) => {
    const request = new Request(url, options);
    const parsed = new URL(request.url);
    assert.equal(parsed.origin, "http://template-fixture.invalid");
    assert.ok(
      parsed.pathname.startsWith("/agent-test/api/"),
      "Configured deployment base must be preserved.",
    );
    if (request.method === "POST" && parsed.pathname.endsWith("/templates")) {
      uploads += 1;
      uploadStarted?.();
      if (uploadGate) await uploadGate;
    }
    if (request.method === "POST" && parsed.pathname.endsWith("/versions")) {
      saves += 1;
      if (failVersion)
        return Response.json(
          { error: { code: "server", message: "Fixture resource failure" } },
          { status: 500 },
        );
    }
    const payload =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : Buffer.from(await request.arrayBuffer());
    const result = await app.inject({
      method: request.method,
      url: parsed.pathname + parsed.search,
      headers: Object.fromEntries(request.headers),
      payload,
    });
    return new Response(result.rawPayload, { status: result.statusCode, headers: result.headers });
  };
  globalThis.fetch = fetchFixture;
  const http = createHttpClient("http://template-fixture.invalid/agent-test/api", fetchFixture);
  const houses = createHouseClient(http);
  const templates = createTemplateClient(http);
  const images = createImageClient(http);
  const card = await houses.create("Template wrapper checks");
  const envelope = await houses.loadDocument(card.id);
  session = createEditorSession(card.id, envelope.document, envelope.revision, houses);
  bridge = createAutomation(
    {
      session,
      images,
      templates,
      onTemplatesChanged: () => {
        refreshes += 1;
      },
    },
    [],
  );
  const hp = bridge.api;
  const generation = () => session.documents.getState().generation;
  const change = (name, input = {}) =>
    hp.callTool(name, { ...input, expectedGeneration: generation(), requestId: crypto.randomUUID() });
  const glb = await readFile(new URL("../server/builtin-templates/dining-table/v1.glb", import.meta.url));
  const importArgs = {
    fileName: "my-figure.glb",
    dataBase64: glb.toString("base64"),
    options: { format: "gltf" },
    expectedGeneration: generation(),
    requestId: "upload-figure",
  };
  const historyBefore = session.history.getState().past.length;
  const imported = success(await hp.tools.import_template(importArgs));
  const retry = success(await hp.tools.import_template(importArgs));
  check(
    "GLB import uses the real multipart client/backend, returns a draft, refreshes once and deduplicates retries",
    () => {
      assert.deepEqual(imported, retry);
      assert.equal(uploads, 1);
      assert.equal(refreshes, 1);
      assert.equal(generation(), 0);
      assert.equal(session.history.getState().past.length, historyBefore);
      assert.deepEqual(imported.draft.versions, []);
      assert.equal(imported.draft.metadataSource, "extras");
    },
  );
  const draft = success(await hp.tools.get_template_draft({ templateId: imported.templateId }));
  assert.deepEqual(draft, imported);
  rejected(await hp.tools.get_template_draft({ templateId: "t_missing1" }), "NOT_FOUND");
  rejected(await hp.tools.get_template_draft({ templateId: "dining-table" }), "INVALID_INPUT");
  const versionArgs = {
    templateId: imported.templateId,
    metadata: { ...draft.draft.prefilledMetadata, label: "My generated figure" },
    rootTransform: draft.draft.rootTransform,
    nodeRules: draft.draft.nodeRules,
    expectedGeneration: generation(),
    requestId: "save-figure-v1",
  };
  const saved = success(await hp.tools.save_template_version(versionArgs));
  assert.deepEqual(success(await hp.tools.save_template_version(versionArgs)), saved);
  check(
    "saving validates a version, returns its ID/version, refreshes once and leaves model history unchanged",
    () => {
      assert.equal(saved.templateId, imported.templateId);
      assert.equal(saved.version, 1);
      assert.equal(saves, 1);
      assert.equal(refreshes, 2);
      assert.equal(generation(), 0);
      assert.equal(session.history.getState().past.length, historyBefore);
      const tool = hp.describe().tools.find((t) => t.name === "save_template_version");
      assert.equal(tool.effect, "resource");
    },
  );
  const floorId = envelope.document.floors[0].id;
  const room = success(
    await change("create_room", {
      floorId,
      name: "Figure room",
      positionMm: { x: 0, y: 0 },
      shape: { type: "rectangle", positionMm: { x: 0, y: 0 }, rotationDeg: 0, widthMm: 4000, depthMm: 3000 },
    }),
  );
  const placed = success(
    await change("place_object", {
      areaId: room.areaId,
      templateId: saved.templateId,
      version: saved.version,
      name: "Generated figure",
      positionMm: { x: 0, y: 0 },
    }),
  );
  success(await change("save", { message: "Import and place generated figure" }));
  const reloaded = await houses.loadDocument(card.id);
  check("import → draft → save version → place → Git save/reload works with real stored glTF", () => {
    const instance = reloaded.document.floors[0].areas[0].objects[0];
    assert.equal(instance.id, placed.objectId);
    assert.equal(instance.templateId, saved.templateId);
    assert.equal(instance.templateVersion, 1);
    assert.ok(instance.parameters.widthMm > 0);
  });
  const revised = success(
    await change("save_template_version", {
      templateId: saved.templateId,
      metadata: { ...versionArgs.metadata, label: "Figure revision two" },
      rootTransform: draft.draft.rootTransform,
    }),
  );
  const afterVersion = success(await hp.tools.get_template_draft({ templateId: saved.templateId }));
  check("new versions append while placed objects keep their pinned version", () => {
    assert.equal(revised.version, 2);
    assert.deepEqual(afterVersion.draft.versions, [1, 2]);
    assert.equal(session.documents.getState().document.floors[0].areas[0].objects[0].templateVersion, 1);
  });
  const gltfDoc = await new NodeIO().readBinary(glb);
  const jsonDoc = await new NodeIO().writeJSON(gltfDoc);
  for (const buffer of jsonDoc.json.buffers ?? []) {
    const bytes = jsonDoc.resources[buffer.uri];
    assert.ok(bytes);
    buffer.uri = `data:application/octet-stream;base64,${Buffer.from(bytes).toString("base64")}`;
  }
  const selfContained = success(
    await change("import_template", {
      fileName: "self-contained.gltf",
      dataBase64: Buffer.from(JSON.stringify(jsonDoc.json)).toString("base64"),
      options: { format: "gltf" },
    }),
  );
  const asciiStl =
    "solid triangle\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1000 0 0\nvertex 0 1000 0\nendloop\nendfacet\nendsolid triangle\n";
  const stl = success(
    await change("import_template", {
      fileName: "triangle.stl",
      dataBase64: Buffer.from(asciiStl).toString("base64"),
      options: { format: "stl", unit: "mm", upAxis: "+z", frontAxis: "-y" },
    }),
  );
  check("self-contained UTF-8 glTF and STL reuse the existing import options and conversion", () => {
    assert.equal(selfContained.draft.sourceFormat, "gltf");
    assert.equal(stl.draft.sourceFormat, "stl");
    assert.equal(stl.draft.rootTransform.scale, 0.001);
  });
  const uploadsBeforeInvalid = uploads;
  for (const invalid of [
    { ...importArgs, dataBase64: "!!!!" },
    { ...importArgs, dataBase64: "Zg=" },
    { ...importArgs, dataBase64: "Zh==" },
    { ...importArgs, dataBase64: "data:model/gltf-binary;base64,Zg==" },
    { ...importArgs, dataBase64: "Zg==\n" },
    { ...importArgs, fileName: "../figure.glb" },
    { ...importArgs, fileName: "folder\\figure.glb" },
    { ...importArgs, fileName: "wrong.stl" },
  ])
    rejected(
      await change("import_template", {
        fileName: invalid.fileName,
        dataBase64: invalid.dataBase64,
        options: invalid.options,
      }),
      "INVALID_INPUT",
    );
  check(
    "bad base64, noncanonical padding, data URLs, filename paths and format mismatches never upload",
    () => assert.equal(uploads, uploadsBeforeInvalid),
  );
  const refreshesBeforeInvalid = refreshes;
  rejected(
    await change("import_template", {
      fileName: "corrupt.glb",
      dataBase64: "bm90LWEtbW9kZWw=",
      options: { format: "gltf" },
    }),
    "INVALID_INPUT",
  );
  rejected(
    await change("save_template_version", {
      templateId: saved.templateId,
      metadata: { ...versionArgs.metadata, materialSlots: { invalid: "No such material" } },
      rootTransform: draft.draft.rootTransform,
    }),
    "INVALID_INPUT",
  );
  rejected(
    await change("save_template_version", {
      templateId: "t_missing1",
      metadata: versionArgs.metadata,
      rootTransform: draft.draft.rootTransform,
    }),
    "NOT_FOUND",
  );
  check(
    "server asset and semantic metadata validation remain authoritative and do not refresh on failure",
    () => assert.equal(refreshes, refreshesBeforeInvalid),
  );
  failVersion = true;
  rejected(
    await change("save_template_version", {
      templateId: saved.templateId,
      metadata: versionArgs.metadata,
      rootTransform: draft.draft.rootTransform,
    }),
    "RESOURCE_FAILED",
  );
  failVersion = false;
  rejected(
    await hp.tools.import_template({ ...importArgs, requestId: "stale-upload", expectedGeneration: 0 }),
    "STALE_GENERATION",
  );
  session.ui.setState({ tool: "rectangle" });
  rejected(
    await change("save_template_version", {
      templateId: saved.templateId,
      metadata: versionArgs.metadata,
      rootTransform: draft.draft.rootTransform,
    }),
    "BUSY",
  );
  session.ui.setState({ tool: "select" });
  rejected(
    await change("batch", {
      label: "Cannot batch an upload",
      operations: [{ tool: "import_template", input: {} }],
    }),
    "INVALID_INPUT",
  );
  check("resource errors, stale generations, active manual tools and batch exclusion are explicit", () =>
    assert.equal(session.documents.getState().document.floors[0].areas[0].objects.length, 1),
  );

  // Hold the actual transport to test concurrency and successful identical in-flight retries.
  uploadGate = new Promise((resolve) => {
    releaseUpload = resolve;
  });
  const started = new Promise((resolve) => {
    uploadStarted = resolve;
  });
  const concurrentArgs = { ...importArgs, expectedGeneration: generation(), requestId: "concurrent-upload" };
  const firstUpload = hp.tools.import_template(concurrentArgs);
  await started;
  const duplicateUpload = hp.tools.import_template(concurrentArgs);
  rejected(await change("undo"), "BUSY");
  rejected(
    await hp.tools.import_template({ ...concurrentArgs, fileName: "different.glb" }),
    "REQUEST_ID_REUSED",
  );
  const countBeforeRelease = uploads;
  releaseUpload();
  const firstResult = await firstUpload;
  const duplicateResult = await duplicateUpload;
  success(firstResult);
  check("in-flight identical resource retries share one upload; other mutations are blocked", () => {
    assert.deepEqual(firstResult, duplicateResult);
    assert.equal(uploads, countBeforeRelease);
  });
  uploadGate = undefined;
  uploadStarted = undefined;

  uploadGate = new Promise((resolve) => {
    releaseUpload = resolve;
  });
  const startedClosing = new Promise((resolve) => {
    uploadStarted = resolve;
  });
  const closingUpload = change("import_template", {
    fileName: "closing.glb",
    dataBase64: importArgs.dataBase64,
    options: { format: "gltf" },
  });
  await startedClosing;
  const refreshesBeforeClose = refreshes;
  const documentBeforeClose = session.documents.getState().document;
  bridge.dispose();
  releaseUpload();
  rejected(await closingUpload, "SESSION_CLOSED");
  check("an upload finishing after disposal cannot refresh a later editor or change its model", () => {
    assert.equal(refreshes, refreshesBeforeClose);
    assert.equal(session.documents.getState().document, documentBeforeClose);
  });
  process.stdout.write(`${checks} template wrapper integration checks passed.\n`);
} finally {
  releaseUpload?.();
  bridge?.dispose();
  session?.dispose();
  globalThis.fetch = originalFetch;
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
}
