# Homeplan Houses screen agent guide

The Houses screen (the home page, the list of houses) exposes `window.homeplan` in the page's JavaScript context, with `describe().level === "houses"`. No house is open here; these tools manage the house list. Homeplan performs the backend requests itself.

1. Read `window.homeplan.describe()`. Check `level`: `"houses"` here, `"editor"` once a house is open in the Floor Builder.
2. Call `await window.homeplan.tools.list_houses()` (and `list_trash()` for trashed houses). Identify houses by `id`; names are not unique.
3. Change only houses the user asked about. Never rename, trash or restore other houses.

Tools:

- `create_house { name, requestId }` creates a house with its first floor and returns its card. It does not open it.
- `clone_house { houseId, name?, requestId }` copies the house's last saved state into a new house ("<name> (copy)" by default).
- `rename_house { houseId, name, requestId }` changes the display name only.
- `trash_house { houseId, requestId }` moves a house to the trash. There is no permanent-delete tool; only the user can purge the trash.
- `restore_house { houseId, requestId }` brings a trashed house back.
- `open_house { houseId }` navigates to the Floor Builder. This bridge then closes: wait until `window.homeplan?.describe().level === "editor"`, reacquire `window.homeplan`, and read its `getting-started` guide before editing.

Every changing tool requires a unique `requestId`. An identical retry with the same ID returns the original successful result while this screen stays open; a different call needs a new ID. One change runs at a time (`BUSY` otherwise); await each call. If a request failed with `RESOURCE_FAILED`, check `list_houses`/`list_trash` before retrying, because the server may have completed it.

Results are `{ ok: true, sessionId, data }` or `{ ok: false, sessionId, error: { code, message } }`. Codes include `INVALID_INPUT`, `NOT_FOUND`, `BUSY`, `REQUEST_ID_REUSED`, `RESOURCE_FAILED` and `SESSION_CLOSED` (the screen was left; reacquire `window.homeplan`). The visible house list refreshes after each successful change.
