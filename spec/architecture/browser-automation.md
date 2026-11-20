# Browser automation

Updated: 2026-11-19.

Status: owner requirement (2026-11-15): expose editor operations and discoverable documentation through global JavaScript functions. Owner request (2026-11-19): expose house-level tools on the Houses screen too ([Houses-level bridge](#houses-level-bridge)). The agent calls these wrappers; Homeplan performs backend requests through its configured resource clients. This is a documented exception to the prohibition on undocumented global state, not a global service locator.

## Contract and discovery

`window.homeplan` exists while the Floor Builder is mounted with a loaded house, and (with a different tool set) while the Houses screen is mounted. `describe()` returns API version `1`, `level` (`"editor"` here, `"houses"` on the Houses screen), session identity, instructions, documentation metadata, and tool definitions. Definitions contain `name`, `functionPath`, `description`, `inputSchema`, `outputSchema`, effects, and examples. `docs.read(id)` returns a Markdown guide. `tools.<name>(input)` and `callTool(name, input)` invoke the same wrapper. These are JavaScript functions, not MCP endpoints; no WebMCP support is claimed.

The editor and the Houses screen link to the public `agent.md` bootstrap (`public/agent.md`, deployment base path respected). It explains page-context execution and `describe()`. The live catalog is authoritative for tool availability. The registry under `src/features/floor-builder/automation/` owns descriptions, schemas, examples, and handlers together; guides supply cross-tool workflows. JSON-input checks, schema validation, request fingerprints, the idempotent request ledger, and resource-error mapping live in `bridgeCore.ts` there and are shared with the Houses-level bridge. TypeBox schemas are validated with the existing Ajv configuration. Per-entity properties reuse the schemas that own the property panel, including template parameters.

The v1 registry contains 28 tools: `get_state`, `get_geometry`, `list_templates`, `list_images`, `list_material_presets`, `set_view`, `undo`, `redo`, `save`, `create_floor`, `delete_floor`, `create_room`, `move_room`, `add_shape`, `replace_shape`, `raise_walls`, `get_entity_schema`, `set_properties`, `delete_entities`, `get_template`, `place_object`, `place_opening`, `add_light`, `add_carpet`, `batch`, `import_template`, `get_template_draft`, and `save_template_version`. Exact schemas, outputs, and examples come from `describe()`, rather than a second hand-maintained schema document. `set_properties` validates the combined changes against the owning schema; switching a template version also verifies that the requested version exists and loads its parameter schema.

## Template authoring

Owner addition (2026-11-15): agents can import a generated model, inspect its draft, save a version and place it without operating the Object Editor UI or issuing HTTP requests themselves.

- `import_template` accepts `fileName`, standard padded `dataBase64` (no data-URL prefix or whitespace), and the existing `TemplateImportOptions` contract as `options`. GLB/self-contained glTF and STL follow the existing import rules, including the 100 MiB decoded-file limit. The wrapper decodes into a browser `File` and calls `templateClient.importModel`. It returns the existing `{ templateId, draft }` response; no version or placed instance exists yet.
- `get_template_draft` accepts a house `templateId` and returns that same draft response through `templateClient.draft`.
- `save_template_version` accepts `templateId` plus the existing version-body fields (`metadata`, `rootTransform`, optional `nodeRules` and `label`), and returns `{ templateId, version }`. The server validates metadata against the asset and runs the glTF Validator, as in the Object Editor. Existing instances keep their pinned versions.

Import and version saving have the `resource` effect, use the ordinary generation/request-ID guards and are excluded from model batches and Undo. They do not change the house document generation. Success refreshes the editor's template library without replacing the bridge. Request fingerprints for resource operations use SHA-256 so the retry cache retains hashes rather than uploaded file contents. The bridge accepts JSON arguments only and exposes no arbitrary URL fetch or filesystem path upload.

Asset requests already sent to the server can finish after navigation; they cannot be rolled back by closing the bridge. Closed calls return `SESSION_CLOSED` and do not refresh a later editor. A network/server failure returns `RESOURCE_FAILED`; because the existing backend has no durable request-ID protocol, inspect `list_templates`/`get_template_draft` before retrying a request whose server outcome is uncertain. Input/resource validation is still returned as `INVALID_INPUT` or `NOT_FOUND`. Explicit house `save` records the imported assets and placed instances through the normal Git workflow.

## State and execution

There is one authoritative editor document. All model changes execute domain commands through `EditorSession.execute`, with ordinary rendering, working writes, undo/redo, and explicit Git revision saves. RealFloor/RealWall/RealAllWalls remain derived. House assets remain server-owned. Resource reads and metadata loads happen inside the application; the external agent does not construct HTTP requests.

Every state-changing call requires the `expectedGeneration` returned by a read or prior result, and a `requestId`. Each result contains `ok`, `sessionId`, `generation`, and either `data` or a structured error. Read results are detached snapshots. Callers must reacquire state after conflicts. API generation is the in-memory generation, distinct from backend revisions and Git revisions. Tool errors are returned, not silently ignored.

Implementation conventions: one changing call runs at a time; competing calls return `BUSY`. Guard model edits, history, saves, and view changes before and after asynchronous preparation. A non-Select tool, active tool operation (including runtime-only Select previews, published by the tool controller), document preview, pending light placement, or open roof-profile operation returns `BUSY` without canceling the user's operation. Successful changing calls are remembered for the most recent 200 request IDs; an identical retry returns its original result, while a reused ID with different arguments is rejected. These IDs are session-local, not a durable exactly-once guarantee. Failed calls may be retried after correction. A session identity distinguishes generations after reopening or navigating.

A batch prepares commands against successive detached document versions, then executes their combined applications as one validated command and undo entry. Preparation never publishes intermediate documents. Batch operations must be model edits; resource reads, saves, view actions, and history actions are separate. Fresh IDs returned by one batch operation are used in later calls; there is no placeholder/interpolation language.

The bridge is removed on unmount. Previously captured functions return `SESSION_CLOSED`; asynchronous preparation cannot publish into a disposed session. No raw stores, arbitrary command closures, filesystem operations, or conflict-overwrite helpers are exposed.

## Houses-level bridge

Owner request (2026-11-19). While the [Houses screen](../builder/screens/houses.md) is mounted, `window.homeplan` is a separate bridge with `describe().level === "houses"`, created in `src/features/houses/automation/` and mounted by `useHousesAutomation`. It has the same shape (`apiVersion` `1`, `describe()`, `docs.read(id)` with a `getting-started` guide, `tools.<name>`, `callTool`) and delegates to the typed house resource client; the routes are the existing [house routes](api.md#houses). No new backend route exists.

| Tool | Input | Effect | Data |
| --- | --- | --- | --- |
| `list_houses` | `{}` | read | `{ houses }` (valid and invalid cards, as `GET /api/houses`) |
| `create_house` | `{ name, requestId }` | resource | `{ house }` |
| `clone_house` | `{ houseId, name?, requestId }` | resource | `{ house }` |
| `rename_house` | `{ houseId, name, requestId }` | resource | `{ revision, house }`; the wrapper reads the card's current revision for `expectedRevision` |
| `trash_house` | `{ houseId, requestId }` | resource | `{ houseId }`; moves to trash only |
| `list_trash` | `{}` | read | `{ houses: [{ house, trashedAt }] }` |
| `restore_house` | `{ houseId, requestId }` | resource | `{ houseId }` |
| `open_house` | `{ houseId }` | navigate | `{ houseId }`; verifies a valid listed house, then navigates to the Floor Builder |

There is deliberately no purge tool: permanently deleting a house stays a user action behind the Trash view's confirmation. Results are `{ ok: true, sessionId, data }` or `{ ok: false, sessionId, error: { code, message } }`; there is no document generation on this screen. Error codes are `INVALID_INPUT`, `NOT_FOUND` (unknown tool, guide, or house), `BUSY`, `REQUEST_ID_REUSED`, `RESOURCE_FAILED`, `SESSION_CLOSED`, and `INTERNAL_ERROR`.

Changing (`resource`) tools require a `requestId` and use the editor bridge's ledger: one change at a time (`BUSY` otherwise), identical retries of the running or the 200 most recent successful requests return the original result, and a reused ID with other arguments is rejected. IDs are session-local; because the backend has no durable request-ID protocol, a `RESOURCE_FAILED` outcome is checked with `list_houses`/`list_trash` before retrying. A successful change refreshes the visible house and trash lists. Reads and `open_house` need no request ID.

Unmounting the Houses screen disposes the bridge: captured functions return `SESSION_CLOSED`, `describe()`/`docs.read()` throw, and a request that completes after disposal does not refresh the page. `open_house` reports success and then the Floor Builder's editor bridge replaces `window.homeplan`; the agent waits for `describe().level === "editor"` and reacquires the object. The agent instructions tell the agent to act only on houses the user asked about.

## Fake HA bridge

Owner request (2026-11-20, Phase 21.18). In the HA viewer's dev harness (`ha-viewer/harness.html`, never in Home Assistant or the website's live demo), `window.homeplan` is the fake Home Assistant's bridge (`ha-viewer/fakeHaBridge.ts`): the same shape (`apiVersion` `1`, `describe()` with `level: "fake-ha"`, instructions and tool definitions with `functionPath`, `description`, `effect`, `inputSchema` and `examples`; `tools.<name>(input)`; `callTool(name, input)`), results `{ ok: true, data }` or `{ ok: false, error: { code, message } }` with `INVALID_INPUT`, `NOT_FOUND` or `INTERNAL_ERROR`. Inputs are checked against TypeBox schemas with the shared Ajv configuration. It does what Settings → Setup HA does: `list_entities`, `get_entity`, `set_entity`, `delete_entity`, `reset_entities` (the entities kept in this browser), `call_service` (as the viewer and HA's cards call it), `list_controls` / `run_control` (the step controls), `set_dark_mode`, `get_last_action`, `list_renderers` (with each renderer's fields and this browser's values) / `set_renderer` (optionally with field values) and `write_demo_bubbles` (both reload the page). Fake data only: no request IDs or generations, and nothing reaches a real Home Assistant.

## Scope

Supported tools are listed by the runtime catalog. The editor opens an existing house through the ordinary Houses screen (or the Houses-level `open_house`); the editor bridge operates on that house. External image interpretation, browser-extension permissions, and extension tool discovery are outside the bridge. Built-in image recognition remains outside the [MVP](../product/mvp-scope.md#outside-the-mvp).

## Verification

Implemented. `npm run agent:check` runs the scripted checks of the tool registry, the template tools, and the Houses-level registry (schemas and examples, no purge tool, idempotent retries, one change at a time, the `open_house` navigation callback, and disposal) against in-memory route fixtures. Verify room creation, boundary-backed walls, template placement, property schemas, invalid-input rollback, atomic batches, stale generations, idempotent retries, async/manual races, revision saves, and disposal. Interactive workflows are additionally confirmed in the actual editor.
