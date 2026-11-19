# Creating templates and placing them in rooms

Homeplan imports and validates your generated 3D asset; the external agent generates its geometry. Use glTF 2.0 (GLB or self-contained glTF). Homeplan metadata belongs in the scene's `extras.homeplan`. STL is also accepted and converted on import, using explicit source units/orientation. Images alone are not a 3D model.

The complete sequence is `import_template` → optional `get_template_draft` → `save_template_version` → `place_object` (or `place_opening`) → `save`. Every request is a window-function call. Homeplan's configured resource clients handle backend requests, multipart encoding, response validation, and asset URLs.

`import_template` takes `fileName`, `dataBase64`, `options`, `expectedGeneration`, and `requestId`. Encode the actual file bytes as standard padded base64, with no whitespace or `data:` prefix. The decoded file limit is 100 MiB. `fileName` contains no directory components. `options.format` is `gltf` for .glb/.gltf, or `stl` for .stl. glTF files must contain their buffers/textures as data URIs or use GLB; external resource URLs are not fetched by this bridge. For STL, supply `options.unit` (for example `mm`) or `knownDimensionMm` plus `knownAxis`; `upAxis`/`frontAxis` use the documented signed-axis choices in the input schema.

Example, given the generated model's base64 bytes in `modelBase64` and a room ID in `areaId`:

```js
const hp = window.homeplan;
if (!hp) throw new Error("Open a house first.");
const state = await hp.tools.get_state();
if (!state.ok) throw new Error(state.error.message);
let generation = state.generation;
// crypto.randomUUID() is missing on plain-http pages, so build request IDs another way.
let requestCount = 0;
const newRequestId = () => `r-${Date.now().toString(36)}-${(requestCount += 1)}-${Math.random().toString(36).slice(2)}`;
const change = async (name, input) => {
  const result = await hp.callTool(name, {
    ...input,
    expectedGeneration: generation,
    requestId: newRequestId(),
  });
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  generation = result.generation;
  return result.data;
};
const imported = await change("import_template", {
  fileName: "my-figure.glb",
  dataBase64: modelBase64,
  options: { format: "gltf" },
});
const draft = imported.draft;
const metadata = structuredClone(draft.prefilledMetadata);
metadata.label = "My figure";
// Inspect/edit metadata. An ordinary room object uses contract Areable,
// attachment.hosts ["floor"], and contact "bottom".
const saved = await change("save_template_version", {
  templateId: imported.templateId,
  metadata,
  rootTransform: draft.rootTransform,
  nodeRules: draft.nodeRules,
});
const placed = await change("place_object", {
  templateId: saved.templateId,
  version: saved.version,
  areaId,
  name: "My figure",
  positionMm: { x: 0, y: 0 },
});
await change("save", { message: "Create and place my figure" });
console.log(placed.objectId);
```

If you have a glTF JSON object instead of file bytes, encode its UTF-8 bytes before importing:

```js
const bytes = new TextEncoder().encode(JSON.stringify(gltf));
let binary = "";
for (let i = 0; i < bytes.length; i += 32768) {
  binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
}
const modelBase64 = btoa(binary);
```

Import returns `{ templateId, draft }`. The draft contains `prefilledMetadata`, `metadataSource`, `rootTransform`, `nodeRules`, bounds in millimetres, warnings, and saved versions. Check warnings and metadata before saving. A source with valid Homeplan extras retains them; otherwise Homeplan supplies defaults. Importing alone does not create a placeable version.

`get_template_draft({ templateId })` reads the current draft without changing anything. `save_template_version` takes `templateId` plus `metadata`, `rootTransform`, optional `nodeRules`, and optional `label`; its input schema exposes the authoritative metadata rules. Saving appends a validated version and returns `{ templateId, version }`. Existing instances keep their pinned version. Use `set_properties` with both `templateVersion` and the required parameters to adopt another version on an existing object. Source geometry is immutable within a template: import a changed mesh as another template, then place it or replace the old instance deliberately.

Imports and version saves are asset operations (`resource` effect), outside model Undo and `batch`. They refresh the editor's template picker and do not increment the model generation. Placement is a model edit and can be undone. An explicit house `save` records the assets and document in Git.

Use the same request ID and exact arguments only for an identical retry within this live session. Successful retries do not upload another asset or append another version. This is session-local deduplication, not a backend exactly-once protocol. If a network/server error makes the outcome uncertain, inspect `list_templates` or `get_template_draft` before retrying. A request already sent can finish on the server after navigation, even though its old bridge returns `SESSION_CLOSED`.
