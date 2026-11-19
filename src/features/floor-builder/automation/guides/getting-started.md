# Homeplan browser agent guide

The loaded Floor Builder exposes `window.homeplan` in the page's JavaScript context. Use that object for all operations, including backend resource reads and saves. The application handles URL configuration and transport. A browser extension must provide page-context JavaScript execution; an isolated content script cannot assume access to page globals.

1. Read `window.homeplan.describe()` to discover API version, session ID, documentation, and tool schemas. The live catalog is authoritative.
2. Read `window.homeplan.docs.read("coordinates")` and `window.homeplan.docs.read("layout")`.
3. Call `await window.homeplan.tools.get_state()` to obtain the loaded house and generation.
4. Invoke a tool at its catalogued `functionPath`, or use `await window.homeplan.callTool(name, input)`. All tool calls return promises and structured results.
5. Check `ok` before using `data`. Use the returned generation for your next changing call, with a new request ID. On a stale generation, read state again and reconsider the edit.

The bridge operates on the house already open in the editor (`describe().level === "editor"`). To start a new house, create/open it from the Houses screen, whose own `window.homeplan` has `level: "houses"` and house-list tools (`create_house`, `open_house`, …). After navigation or reload reacquire `window.homeplan`; never reuse a function captured from the previous session.

Every changing tool requires `expectedGeneration` and `requestId`. A request ID identifies one exact call, including its generation. An identical retry returns the original successful result while remembered; a different call needs a new ID. The last 200 successful changing requests are remembered for this session only. Never automatically repeat an old operation after reopening the editor. Successful retry results contain the original generation; get fresh state if other work may have happened since.

Only one agent change runs at a time. Await each call. When a manual drawing/dragging tool is active, finish or cancel it and choose Select before asking the agent to make changes. Agent calls do not cancel a user's operation. Tool completion confirms the document operation; it does not promise that the browser has painted the next frame.

Tools return `{ ok: true, sessionId, generation, data }` or `{ ok: false, sessionId, generation, error: { code, message } }`. `describe()` and `docs.read()` are synchronous discovery helpers and throw if the bridge is closed or a guide does not exist. Snapshot results are detached: changing them does not edit the house.

Use `get_entity_schema` before changing properties, `list_templates` and `get_template` before placing instances, and `get_geometry` to inspect derived flags. Uploaded plan images are interpreted by you, the external agent; Homeplan does not recognize plans or infer missing measurements. Ask the user about uncertain scale or dimensions.

For a new custom figure, read `docs.read("templates")`. `import_template`, `get_template_draft`, and `save_template_version` expose the authoring workflow; then place the saved version with `place_object` or `place_opening`. Asset writes use the `resource` effect and sit outside document Undo/batches.
