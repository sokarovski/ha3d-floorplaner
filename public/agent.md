# Homeplan AI agent instructions

Homeplan exposes a documented JavaScript tool interface on the Houses screen and while a house is open in Floor Builder.

## Where you are

`window.homeplan` exists on two screens. Detect which one with `window.homeplan.describe().level`:

- **`"houses"` — Houses screen (the home page, the list of houses):** no house is open; the tools manage the house list. See [On the Houses screen](#on-the-houses-screen).
- **`"editor"` — Floor Builder (a house is open):** every editing command for that house. See [In the Floor Builder](#in-the-floor-builder).

If `window.homeplan` is absent, the page is still loading or is another screen (for example the Object Editor); go to the Houses screen.

## On the Houses screen

```js
window.homeplan.describe()                       // level "houses", tools, schemas, examples
window.homeplan.docs.read("getting-started")     // the houses guide
await window.homeplan.tools.list_houses()
```

The tools are `list_houses`, `create_house { name }`, `clone_house { houseId, name? }`, `rename_house { houseId, name }`, `trash_house { houseId }`, `list_trash`, `restore_house { houseId }` and `open_house { houseId }`. Changing tools also take a unique `requestId` (an identical retry returns the original result). Results are `{ ok, sessionId, data }` or `{ ok: false, sessionId, error: { code, message } }`; the visible list refreshes after each change.

- Identify houses by `id` from `list_houses`; names are not unique. Never rename, clone, trash or restore a house the user did not ask about.
- `trash_house` only moves a house to the trash. There is no permanent-delete tool; only the user can purge the trash.
- `open_house` navigates to the Floor Builder and closes this bridge (old functions return `SESSION_CLOSED`). Wait until `window.homeplan?.describe().level === "editor"`, then reacquire `window.homeplan` and continue below.

## In the Floor Builder

Execute in the editor page's JavaScript context:

```js
window.homeplan.describe()
```

The result lists API version, `level: "editor"`, session identity, tool names, exact function paths, JSON input/output schemas, examples, and Markdown guide IDs. Read the guide:

```js
window.homeplan.docs.read("getting-started")
```

Then inspect the current house:

```js
await window.homeplan.tools.get_state()
```

Call tools with `await window.homeplan.tools.<tool_name>(input)` or `await window.homeplan.callTool(name, input)`. The live catalog explains each input. Changing calls require the current `expectedGeneration` and a unique `requestId`. Check every result's `ok` field.

Use these window functions for resource reads and saves too. Homeplan contacts its backend using its own configured resource clients; the agent does not need to construct URLs or issue HTTP requests.

To create a template from generated geometry, read `window.homeplan.docs.read("templates")`. The tools `import_template`, `get_template_draft`, and `save_template_version` import a model and create a validated version; `place_object`/`place_opening` attach instances to the room/wall. Asset operations are separate from model Undo.

If the object is absent, go to the Houses screen, create or open a house there (`create_house`, `open_house`), and wait for `describe().level === "editor"`. After navigation, reacquire the object. The browser agent needs page-context JavaScript execution; isolated extension content scripts do not automatically share page globals. This custom interface does not automatically register tools in every AI extension and is not an MCP server.
