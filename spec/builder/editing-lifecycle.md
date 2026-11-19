# Editing lifecycle

Updated: 2026-11-16.

Status: resolved ([D09](../decisions.md#d09-saving-cancellation-and-model-undo)). One editing session per house; cross-tab collaboration is out of scope. Model history follows [undo/redo](undo-redo.md).

## One authoritative document

React property controls and viewport tools issue typed edits to the same document layer. The renderer derives scene resources from committed data and may display temporary previews. Selection, focus/isolation, tool state, and camera movement are editor state, not extra saved house models.

Keep input drafts separate from committed dimensions. A partial `1.` or invalid template value must not overwrite valid geometry. The shared length parser can show a converted preview while preserving the raw input until commit.

Only guides are editable: floor shapes, walls, area transforms, carpets, wall features, objects, and lights. RealFloor, RealWall, and RealAllWalls are regenerated from them. Group moves (areas, [object groups](features/object-groups.md)) and child edits commit through the same command layer. A draft polygon or derived mesh never becomes a second writable source. See [geometry groups](features/geometry-groups.md).

**Live previews** (owner, Phase 5 follow-up): a running move, turn, or resize draws the thing itself at its new place, not only an outline. The tool hands the session a preview command, applied to a temporary copy of the document without history or validation; the viewport and selection handles draw that copy until the tool commits (one validated command) or cancels, which discards it. The preview is never saved and never becomes the document.

## Operation behavior

| Operation | Preview | Commit | Cancel |
| --- | --- | --- | --- |
| Property edit ([schema-driven panel](property-system.md)) | Draft and validated live result; sliders preview while dragging | Enter, blur, or slider release applies one valid command | Escape restores that field's committed value; there is no panel-wide Cancel |
| Move/rotate/tuck/resize/raise/trim (click–move–click or drag) | First click locks the operation; live preview of the result, live readout, optional typed value | Second click, release after a drag, or Enter applies one command | Escape/interruption restores the prior geometry |
| Footprint edit | Editable primitives and derived outline | Validate union/topology before publishing dependent geometry | Keep the last valid committed footprint |
| Roof profile | Show plane and affected geometry | Explicit confirmation saves a modifier | Remove the preview without changing source geometry |
| Camera (Pan, Orbit, Space hold, gestures) | View only | Never a model change | Escape ends a click–move–click camera follow; a running operation is untouched |
| Object import/template edit (Phase 2) | Local draft plus contextual preview | Explicit validated save produces a template version | Leaving with an unsaved draft asks Save or Discard |

Temporary previews should not write JSON on each pointer movement. Numeric input and completed drags pass the same geometric/template validation. Length and number fields commit on Enter or blur, and Escape reverts. Multi-step tools such as the pencil and roof profile commit on explicit confirmation.

## Room editing context and nested levels

Floor and wall tools share one Room Editor (owner, 2026-11-15). Double-click a room (viewport or tree) or press Enter on its tree row to enter. Inside it, the same rule nests one level per double-click: a carpet's **Carpet Editor**, a wall's **face view** and, in that, a feature's **Feature Editor**, and an open **object group** (owner, Phase 5 and 2026-11-16). The levels, their entry and exit gestures, and the header breadcrumb are defined in the [Floor Builder's editing levels](screens/floor-builder.md#editing-levels).

Every level follows one lifecycle. Done, the breadcrumb, or a double-click outside goes one level up, cancelling unfinished previews while retaining committed edits. There is no session snapshot or Cancel/Discard changes at any level; use Undo for individual edits. Escape cancels an operation, then returns to Select, then clears the selection, and only then leaves the level (Phase 7.1). Leaving the house flushes committed work without an edit-session confirmation; failed writes still block navigation until resolved or explicitly abandoned.

## Mode changes and dependencies

Before switching house, floor, editing level, or template context, complete or cancel the active operation predictably. Default: require resolution of invalid/uncommitted form drafts, and cancel transient pointer previews on an unexpected context change. Merely changing selection should not silently save an unfinished operation. Entering or leaving a level, and choosing another tool, cancels the running operation without a history entry and returns to Select. Activating another floor (tree, or Undo of a step on another floor) returns to the overview. When Undo or Redo removes the open room, the editor returns to the overview.

Footprint edits can split/remove wall boundaries. Wall edits can invalidate windows and attachments. Policy: apply the edit as one command. Walls whose source edge left the boundary, and openings that no longer fit, are kept and flagged for repair rather than blocking the edit. Never silently remap a window to an unrelated wall ([D04](../decisions.md#d04-footprints-walls-and-stable-boundaries)).

Area movement can create/remove shared-wall regions. Preview those changes temporarily, then commit the area transform and invalidate all affected neighboring geometry as one operation. Cancel/undo restores both sides' prior physical boundary and materials. Preserve authored wall/object IDs; resolving a shared wall must not destructively combine rooms. Tucks, detents, and opening conflicts are defined in [arranging areas and merging walls](features/shared-walls.md).

## Undo and save behavior

- One completed user operation is one model-history transaction, using forward/inverse changes to authored data. A drag is not hundreds of undo steps. Dependent openings, supports, and RealFloor are regenerated from restored source values.
- Keep initial history in memory for the house editing session, across floor switches. Saving does not clear it; closing/reloading the house ends it. Git revisions are a separate, persistent history; restoring one (header **History** → Restore) writes the current edits first, adds the restored content as a new revision, and starts a new, empty Undo history; Undo cannot step across a restore.
- Uploads, the server-owned asset indexes, file deletion/rename, exports, runtime state, and server revisions are outside model history. Undo an image assignment by restoring its reference; retain the file for reuse/Redo. Object Editor may use an isolated unpublished-draft history.
- The whole house is one document (`house.json`), so one command history covers all floors. Detailed command, resource-retention, and history-boundary rules live in [model undo/redo](undo-redo.md).
- Saving always sends the full document. A **working write** stores validated committed changes 1.5 s after the last commit (implementation convention) and before navigation, so a crash loses nothing. An explicit **Save** (⌘S or the Save button; ⌘S commits a focused field first) also creates a Git revision ([D09](../decisions.md#d09-saving-cancellation-and-model-undo)); History → Save with a note adds a revision message. Show saving/written/saved/failed/conflict status, whether the content differs from the last Save (compared when the working write settles, so Undo back to the saved content counts as no change), and a retry action. The header shows "Changes pending…", "Writing…", "Saved", "Written · not saved as a revision", "Save failed · retrying", or "Conflict".
- Browser agent tools (`window.homeplan`, Phase 6) edit through the same session, commands, history, and save service; a batch is one validated command and one Undo entry, and calls are refused while a manual tool operation or preview is running ([browser automation](../architecture/browser-automation.md#state-and-execution)).
- Acknowledge “saved” only after the backend confirms the document revision. New edits remain dirty if an older save completes.
- Keep unsaved committed edits recoverable after a failed request. Warn on navigation only when it would lose unresolved drafts/unsaved work; browser unload hooks are best effort.
- On an unexpected stale revision, preserve the local draft and offer simple reload/recovery. Cross-tab collaboration, shared history, and automatic geometry merging are outside MVP scope.

Undo applies a new valid document change; it never rewinds server revisions. Failed saves preserve history, and an acknowledgment of an earlier save cannot overwrite a later Undo/Redo. External structural/template/asset changes need the explicit boundaries described in the history design.

## Verification

- Escape during a drag restores the original object, its openings, and dependent support geometry.
- A committed drag undoes/redoes as one operation, with stable IDs.
- Invalid drafts never appear as persisted geometry or overwrite the last valid footprint.
- Switching context cannot leave an active preview or apply stale asynchronous geometry to the next house.
- Save failure/conflict preserves local work and displays an actionable status.
- A save acknowledgment cannot clear edits created after that save started.
- Leaving the Carpet Editor, face view, Feature Editor, or Room Editor by Done, Escape, or a double-click outside keeps every committed edit as its own Undo step. Undo of the step that created an open carpet or feature leaves that level.
- A running move draws the moved thing live; Escape restores it with no history entry and nothing written.
