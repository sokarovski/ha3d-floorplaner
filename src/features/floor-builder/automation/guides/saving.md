# Saving, undo, and recovery

Successful model edits schedule the editor's ordinary working write. This writes the full document and checks the expected server revision. The tool's generation is an in-memory edit counter, not the backend revision or Git commit ID. `get_state` reports save status and history counts.

Call `save` to flush working writes and create an explicit Git revision. Supply an optional message, the latest `expectedGeneration`, and a fresh `requestId`. An identical successful retry uses the remembered result instead of creating another revision. A save failure preserves local work. If a backend conflict is reported, ask the user to resolve it in the editor; the agent bridge does not expose overwrite-server behavior.

`undo` and `redo` operate on the shared editor history, including manual edits. A room creation or batch is one step. They also require a generation and request ID. `delete_entities` is undoable; deleting a room removes its contents. Do not list both a parent and its child in one delete operation. `delete_floor` refuses the last floor.

Error codes:

- `INVALID_INPUT`: consult input/property schemas and correct arguments.
- `NOT_FOUND`: refresh state or the resource catalog; do not invent IDs.
- `EDIT_REJECTED`: the domain rejected the edit; read the message and inspect current geometry/state.
- `STALE_GENERATION`: manual work or another operation changed the document; refresh and replan.
- `REQUEST_ID_REUSED`: the ID was already used with different arguments; use a new ID for a new operation.
- `BUSY`: await another agent call, finish/cancel manual tools, or wait for an existing revision save.
- `SESSION_CLOSED`: reacquire the bridge from the currently open house. Old references cannot edit it.
- `SAVE_FAILED`: local work remains; inspect save state and resolve the failure.
- `RESOURCE_FAILED`: an asset request failed. Inspect the template list/draft before retrying if the server outcome is uncertain; an upload/version may already exist.
- `INTERNAL_ERROR`: stop dependent work and report the message.

During asynchronous preparation (for example loading a template), a manual change invalidates the prepared edit. The wrapper checks the generation again before committing. Reads return the generation of the document snapshot they used; if a read was slow, a subsequent change may correctly reject that generation as stale.
