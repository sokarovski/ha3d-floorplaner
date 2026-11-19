# Model undo and redo

Updated: 2026-11-16.

Status: adopted design ([D09](../decisions.md#d09-saving-cancellation-and-model-undo)), implemented. History is session-local, uses reversible command transactions (Immer patch pairs), and is bounded to 200 entries (implementation convention; the oldest entries drop first). All model data is one `house.json` per house.

## Scope

Provide undo/redo for committed changes to editable model data: area/source-shape/group transforms, wall dimensions, objects/attachments, materials and asset assignments, lights/defaults, roof modifiers, and house model settings. Each completed user operation is one entry, even if it changes several fields or regenerates several meshes.

History records authored model changes, not arbitrary writes to any JSON file. Exclude document/schema revisions, save timestamps/status, asset indexes, render jobs, exports, application preferences, camera/selection/tool state, and calculated RealFloor/meshes. These have their own lifecycles. Undo cannot move a server revision backward.

Asset metadata is server-owned and never part of `house.json` ([D09](../decisions.md#d09-saving-cancellation-and-model-undo)), so undoing a model change and saving the full document can never erase an image uploaded since.

History is kept in memory for the active house editing session. Switching floors within that house keeps its history; closing/reloading the house ends it. Persistent version history is the house's Git revisions ([persistence](../architecture/persistence.md#revision-history)), separate from Undo. Working writes protect the current model; they do not preserve the undo stack across restart.

## One completed operation one transaction

| User operation | History behavior |
| --- | --- |
| Drag an area through hundreds of pointer positions | Temporary preview, then one move transaction on release |
| Type a new wall height | Keep raw draft; one validated command when the field commits |
| Add/delete an area with children | One entry containing the complete authored change needed to restore it |
| Resize an opening and update its attachment parameters | One entry; derived cutout geometry is regenerated |
| Escape during a drag or polygon draft | Restore committed state; do not append an entry |
| A running move, turn, or resize (live preview) | Drawn from a temporary previewed copy; one entry on commit, none on Escape |
| Pan/zoom/orbit (gestures, Pan/Orbit tools, Space hold, camera buttons, gizmo), change selection, toggle a helper | No model history entry |
| Enter or leave an editing level (Room, Carpet, face view, Feature Editor, open group); Show others, Walls off, light controls, Top/3D | No model history entry |
| A browser agent `batch` (Phase 6) | One entry for the whole batch |

Apply the command to an immutable authored-state snapshot, validate the complete candidate, and publish it atomically. Invalid operations do not alter history. Record model changes only after a valid command succeeds; incomplete pointer/form drafts are not saved history.

## Forward and inverse changes

Recommended representation: each history entry contains a label, operation ID, affected stable document/entity IDs, forward patches, inverse patches, and the model-generation context needed to check that they apply. A deleted source object must have enough old data in its inverse changes to restore its children, IDs, parameters, and references.

Do not store a complete copy of the whole house for every keystroke. Per-command before/after snapshots of affected documents are a simpler fallback, but duplicate more data; patch pairs are the recommended starting point. JSON text-line diffs are unsuitable because formatting/order changes do not represent an edit transaction.

Illustrative patch pair on the house document:

```json
{
  "label": "Change wall height",
  "documentId": "house",
  "entityId": "wall-1",
  "forward": [
    { "op": "replace", "path": ["floors", 0, "areas", 0, "walls", 0, "heightMm"], "value": 2800 }
  ],
  "inverse": [
    { "op": "replace", "path": ["floors", 0, "areas", 0, "walls", 0, "heightMm"], "value": 2500 }
  ]
}
```

This is an internal history example, not an API payload or final schema. Stable IDs identify the target; index paths apply only to the matching linear-history state. Array reorder/add/remove commands must also be captured. Unrecorded structural model changes invalidate dependent history rather than rebasing old index paths blindly.

The implementation uses Immer's `produceWithPatches`, which produces next state plus forward/inverse changes, with `applyPatches` for replay; patch support is enabled once at start-up. Each entry stores its label, the floor it belongs to, and the forward and inverse patches. A command whose patches are empty (a no-op) adds no entry, and a command whose result fails house validation is rejected with a notice and adds none. Immer path arrays differ from RFC 6902 JSON Pointer strings; do not call the example a wire-format JSON Patch document or send it directly to an endpoint expecting RFC 6902. The HTTP save API sends complete validated documents, never patches ([D09](../decisions.md#d09-saving-cancellation-and-model-undo)). [Immer patch documentation](https://immerjs.github.io/immer/patches/), [JSON Patch specification](https://www.rfc-editor.org/rfc/rfc6902).

## History cursor and replay

1. On a new committed command, discard any redo branch, append its patch pair, and advance the cursor.
2. Undo takes the entry immediately before the cursor, validates/applies its inverse changes atomically, and moves the cursor back. Redo applies that entry's forward changes and moves the cursor forward.
3. Replay bypasses ordinary history recording so Undo does not create another undo entry. It still emits document/dependency changes, increments the local dirty generation, and schedules saving normally.
4. Rebuild affected geometry and selection context from the restored authored data. Do not store old Three.js resources or RealFloor meshes in history.
5. If validation/dependencies fail, leave both state and cursor unchanged and explain the blocked operation. Do not partially restore half an edit.

Redo restores the same object IDs, not newly allocated duplicates. No-op commands add no entry. Bound history by an explicit command count and memory budget selected against representative houses. Prune oldest entries coherently and retain any data/resources needed by surviving entries. Memory-cap details are implementation work; never retain an unlimited full-house snapshot log.

## House-level history

The house session holds one document, `house.json`, containing every floor, while the renderer displays only the active floor. Each history entry targets entities in that document by stable ID.

A single house JSON does not contain uploaded image or model bytes; those stay separate files. Each save writes the whole document, not a history snapshot.

Show a useful action label: the header's Undo/Redo tooltips name the next step ("Undo: Change heightMm"), and after each Undo or Redo a notice reads "Undid: …" or "Redid: …". If the entry belongs to another floor, Undo activates that floor (returning to the overview) and frames it before applying. If Undo or Redo removes the open room, the editor returns to the overview. Replayed patches are validated like a new command; when a step can no longer be applied, the notice says so and both the document and the cursor stay unchanged. Floor switching itself is not an undoable edit.

Every model command, including floor add, rename, and delete, changes the one house document and is undoable. Deleting the last floor is not allowed.

## Leaving an editing level (owner, 2026-11-15)

Done or double-click outside returns one level up (Feature Editor → face view → Room Editor; Carpet Editor → Room Editor; Room Editor → overview) and preserves committed edits as individual Undo steps. There is no session-wide Cancel/Discard or entry snapshot at any level. Unfinished pointer previews are cancelled without a history entry. Undo does not reopen or close levels by itself, except returning to the overview as described above. This supersedes the earlier Phase 3 session-discard requirement (owner redesign); the levels are defined in the [Floor Builder](screens/floor-builder.md#editing-levels).

## Restoring a Git revision

Restoring a revision from the header's History writes the current edits first, then replaces the document with the restored content as a new revision and starts a new, empty history. Undo cannot step back across a restore; the earlier revisions stay in the Git history.

## Uploads and other file operations

| Operation | Recommended Undo behavior |
| --- | --- |
| Upload an image or model (GLB/glTF/STL) | File and its server-owned index entry are outside model history; a successful upload remains available |
| Assign an uploaded image to a surface | Undo/redo restores the material/asset reference, leaving the file untouched |
| Upload and immediately assign | Complete the upload first, then commit the assignment as one model entry; Undo removes/restores the assignment only |
| Place/remove an imported template instance | Undo the instance data and references; retain its source files/template version |
| Publish a template version | Explicit version boundary; existing instance version-adoption can be a reversible model edit while both versions are retained |
| Generate/export/download an image/package | Job/output lifecycle, outside model history |
| Delete/rename a house folder or permanently replace/remove files | Separate workflow with recovery/reference rules, not a generic JSON Undo command |

For MVP, retain uploaded source assets and required published template versions. Do not garbage-collect a file merely because Undo removed its last current scene reference: a redo entry may still need it. Cleanup/deletion must account for persisted references and live history, or occur after a clear history boundary under a separately designed deletion policy.

Object Editor uses an isolated history for its unsaved template-metadata draft. Publishing that draft is an explicit save/version boundary, not permission for house Undo to delete the imported source file. Label the active undo scope so template-draft Undo is not confused with the house model's history.

If a separately performed structural operation invalidates history, resolve pending saves/drafts, complete that operation, then establish an explicit new history baseline. A failed operation must not discard usable local history or pretend the file operation was undone. Do not advertise unsupported filesystem actions as reversible.

## Saving and cancellation

Undo/redo changes the current model and marks it dirty, just like a new edit. It is independent of whether the original action was already written or saved. Saving or retrying a save is not a history entry, and a successful save does not clear the stack.

Keep acknowledged server revisions, in-flight payloads, and dirty generations outside the undoable data. Serialize saves. If a save for state A is in flight and the user undoes to state B, its acknowledgment advances the server revision but must not overwrite B or clear B's dirty generation. Save B next against the new revision. Returning to an old history cursor alone does not prove the server already contains that content while writes remain in flight.

On save failure, retain the model and its history. On uncertain write outcome, reconcile before retrying. A stale-revision response preserves local work and asks for a simple reload/recovery choice; it does not start a collaborative merge feature. Saving follows the [persistence contract](../architecture/persistence.md) and the [editing lifecycle](editing-lifecycle.md).

## One editing session in MVP

Cross-tab collaborative editing, live broadcasts, shared cursors, automatic merge/rebase, and shared undo history are outside scope. The supported workflow is one active editing session for a house. Do not build a cross-tab coordination layer for this history design.

Retain a small expected-revision check and serialized backend writes as file-integrity safeguards. These are not a promise of multi-tab support: an unexpected stale writer is refused rather than silently corrupting data. No collaboration UI or automatic reconciliation is required.

## Verification direction

- A completed drag is one entry; Escape and invalid input add none.
- Undo/redo restores authored values/IDs and regenerates consistent openings, wall support, shared walls, and RealFloor.
- A new edit after Undo clears the redo branch; save acknowledgments do not become history entries.
- An add/delete/reorder sequence replays correctly without directing an old array-index patch at another object.
- Undoing an image assignment retains the uploaded file; Redo can still resolve it after a save/reload of assets.
- Switching floors retains house history and makes the target of Undo visible without rendering several floors together.
- Pan, Orbit, Space-hold panning, and entering or leaving editing levels leave Undo unchanged.
- After restoring a revision, Undo is disabled until the next edit.
- Undo during an in-flight save preserves the undone model and schedules the correct subsequent revision-aware save.
- A failed/uncertain save, missing dependency, or failed external file operation does not silently lose model data/history.
