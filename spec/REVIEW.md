# Specification review log

## Sixth pass — 2026-11-15: room-editing redesign

The owner replaces separate Area/Wall Editors with one [Room Editor](builder/screens/floor-builder.md#mode-2-room-editor): both toolsets, room double-click or pencil entry, no Floor/Walls magnifiers, trash on deletable tree rows, and doors/windows nested under their wall. Done or double-click outside exits and keeps committed edits; Undo reverses them individually. There is no session-wide Cancel/Discard or entry snapshot. Implemented (Phase 3). This supersedes the fifth pass modal-session/Discard behavior below.

## Fifth pass — 2026-11-14: owner feedback after Phases 1–2

The owner's first hands-on review produced the Phase 3 feedback (F1–F11). Spec changes: [editing focus, tool lifecycle, inference and snapping, wall handles](builder/screens/floor-builder.md#editing-focus-in-room-editor); raise wall grows from 0; [staircase direction and fitting](builder/features/staircase-areas.md#direction-and-fitting); decision [D20 walls on circles](decisions.md#d20-walls-on-circles) (resolved by the owner: walls are semantically raised from the floor outline, straight or curved, while derived geometry stays independent). Kept as working well: Area Editor snapping and object nudging. Added afterwards: Area Editor [Nudge and Corner edit tools](builder/screens/floor-builder.md#nudge-and-corner-edit-tools) (F12, F13), with rectangle-to-polygon conversion that re-anchors walls ([D04](decisions.md#d04-footprints-walls-and-stable-boundaries)); editors isolate the focused area automatically. Wall ends attach to floor corners so resizing a floor never opens holes in its walls (F14, [D04](decisions.md#d04-footprints-walls-and-stable-boundaries), schema version 2). Room moves are free hand with Shift axis lock and edge/corner snapping (F17–F19, [D16](decisions.md#d16-interaction-defaults-and-support-limits)). Editors are modal sessions with Done/Discard (F16); a visible Fit to screen control (F15). Moving happens only with the Nudge tool; Select only selects (F20). The click-to-tuck tool is removed; tucking is a Nudge edge snap that also rotates to align by drag and drop (F21, F22, [D05](decisions.md#d05-walls-between-adjacent-areas)).

## Fourth pass — 2026-11-14: consistency pass, API, and forms

**Owner decisions**

| Topic | Decision | Where |
| --- | --- | --- |
| Image metadata | Server-owned index `textures/images.json`, not in `house.json`. Uploads never change the document revision, so full-JSON saves need no server-side merge | [D09](decisions.md#d09-saving-cancellation-and-model-undo), [D14](decisions.md#d14-project-management-and-names), [persistence](architecture/persistence.md) |
| Object models | Approved; its six extra editors join D18 | [object models](builder/object-models.md), [D18](decisions.md#d18-property-schemas-and-the-property-panel) |
| Reusable objects | Confirmed: the house's template library is the counterpart of its image library, usable in every area and floor | [model](builder/model.md#storage-boundary) |
| API | The backend route map is defined in one owning document | [API](architecture/api.md) |
| Forms | One form builder for everything: `SchemaForm` (live in the property panel, buffered in popups), `Popup` (header title + close, footer Cancel/Save or custom footer), `FormPopup` (values object + JSON Schema config), and one small feature component per form | [forms and popups](design-system/README.md#8-forms-and-popups) |

**Contradictions fixed**

- The illustrative `house.json` and template instance stored materials as catalog/preset IDs; both now store inline surface materials (D19).
- The model pipeline still mentioned a "closed outer-wall region" (wall-driven floors); removed.
- Controllable declarations were described as persisted in MVP; they are post-MVP, and MVP keeps stable IDs only.
- Staircase catalog, roof-cut fixture handling, and the location picker each contradicted their own resolved defaults; each now states the decision once.
- D14 status, the D16 input-model name, WebP support, measurement-guide persistence, Magnetic snapping to guides, and Trackpad/Mouse preference were inconsistent between documents.

**Stale wording removed:** "floor documents", "pending documents", backup directories, "wrapper", "proposed/recommended" on resolved behavior, "user preferences", HA-host and ingress assumptions in MVP delivery documents, duplicated paragraphs, and truncated sentences.

## Third pass — 2026-11-14: owner decisions on review findings

| Topic | Owner decision | Where |
| --- | --- | --- |
| Push detents | Renamed **Touching** (thicknesses add) and **Full clash** (one wall inside the other). Anything between is a partial clash; only pushing past Full clash intrudes and is flagged | [D05](decisions.md#d05-walls-between-adjacent-areas), [shared walls](builder/features/shared-walls.md) |
| Creating areas and other children | Every tree row that holds children has an Add button opening a dropdown of its allowed child types; the design system gains `MenuButton` and `Tree` | [D14](decisions.md#d14-project-management-and-names), [Floor Builder](builder/screens/floor-builder.md#adding-children-from-the-tree) |
| Saving | Always full JSON. Automatic working writes protect against crashes; explicit Save creates a Git revision per house (pure-JavaScript Git), with a History panel for diff and restore. Replaces rotating `backups/` | [D09](decisions.md#d09-saving-cancellation-and-model-undo), [persistence](architecture/persistence.md#revision-history) |
| Number display | Delegated: enough decimals to resolve about 0.1 mm per unit | [D16](decisions.md#d16-interaction-defaults-and-support-limits) |
| Storage | One `house.json` per house with floors inside and the floor name as a property, replacing one folder and `floor.json` per floor. Floor rename/delete become undoable edits; floor trash, reserved names, the journal, and ensure-floor are gone | [D14](decisions.md#d14-project-management-and-names), [persistence](architecture/persistence.md) |
| Materials | Textures are set directly on each surface (glTF material fields plus tile size, rotation, offset); Save as preset copies them to other surfaces; no separate material editor | [D19](decisions.md#d19-materials) |
| Triangle shape | Removed; triangles and other irregular shapes are drawn with the polygon pencil and measuring tape | [D04](decisions.md#d04-footprints-walls-and-stable-boundaries), [D16](decisions.md#d16-interaction-defaults-and-support-limits) |
| Object models | Draft [object models](builder/object-models.md) for every type; owner decided wall span stays in the viewport, placed objects/lights have their own names, and spot lights are in MVP | [object models](builder/object-models.md), [D08](decisions.md#d08-lighting-and-groups) |
| Carpets | New `Floorable` contract: flat 2D shapes hosted only by the area's floor, listed under its Floor row and added from its Add menu | [materials and objects](builder/features/materials-and-objects.md#6-carpets) |
| Object format | Reuse an open standard: every template is glTF 2.0 with Homeplan metadata (direction, resizing/slicing, part rules and stacking, attachment) in `extras`; STL is converted on import. Built-ins use the same format in Phase 1 | [D17](decisions.md#d17-object-asset-format-and-template-metadata), [object templates](builder/features/object-templates.md) |

Added afterwards: [D18](decisions.md#d18-property-schemas-and-the-property-panel), one JSON Schema per object type driving a schema-built property panel with registered property editors documented in `/ds`; live edits with Undo and no panel-wide Cancel ([property system](builder/property-system.md)).

`imported-object-templates.md` was renamed to `object-templates.md`. The stale-wording cleanup was completed in the fourth pass.

## Second pass — 2026-11-14: prepared for MVP planning

**Goal:** close every open decision, remove scope ambiguity, and tighten the writing so that MVP planning can start. Planning itself was not started.

### Owner input in this pass

- **Reference setup:** macOS with trackpad first; the representative house is a real home, measured from scratch. No plan-image tracing.
- **No wall-driven floors.** The floor shape is a guide and walls are extruded from it. **RealFloor** is the floor shape enlarged by outward walls, and **RealWall** is each wall's derived solid. The earlier "wall-driven floor / source mode" concept was a misreading and has been removed.
- **Alignment and curves:** wall alignment is inside, outside, or **center**. Curved walls are post-MVP.
- **Arranging areas:** areas can be rotated, and any inner or outer wall face can be tucked against another; clashing walls merge into **RealAllWalls**.
- **Wall end lines:** dragging a wall's vertical end line trims it, removes it when pushed onto the other end, or extends it past a corner onto the next edge. Bare edges can be re-extruded.
- **Furnishing:** after arranging areas, users furnish each area with ornaments, openings, carpets, and lights.
- **MVP scope:** Phase 1 includes the polygon pencil, carpets, light groups, and measuring guides. Phase 2 includes STL import / Object Editor, staircases, and roof cuts.

### Decisions closed

All of D02, D04, D05, D07, D08, D09, D14, and D16 are now resolved. D06, D10, and D15 remain deferred. The register marks which parts came from the owner and which from review inference, and lists implementation conventions (tolerances, timings, limits) separately so they are not mistaken for open product questions.

Notable inferred resolutions for the owner to sanity-check:

| Decision | Inferred resolution |
| --- | --- |
| D04 | Walls anchor to a stable **source edge** (shape ID + edge key) plus a span. Orphaned walls are kept and flagged, never remapped. |
| D05 | Detent separations are `tA + tB` and `max(tA, tB)`; walls are built as a 2.5D union; each opening has one host wall cutting the full depth; caps and reveals use one neutral cap material. |
| D08 | Light groups are bulk-edit sets with no override layer, so they need no precedence rule. |
| D09 | Autosave about 1.5 s after the last commit; 200-entry history; fsync + rename; rotating backups (one per 10 min, keep 20); journal for multi-document operations. |
| D14 | House folders are named by ID; the default floor is `Etage1`; collisions are case-insensitive; deletes go to trash and are recoverable. |
| D16 | The trackpad gesture map, with a Trackpad/Mouse preference; desktop only (≥ 1280 × 720); upload limits. |

### Reorganization

| Change | Reason |
| --- | --- |
| `product/delivery-sequence.md` → [`product/mvp-scope.md`](product/mvp-scope.md) | Scope, phases, gate, and planning inputs belong in one place |
| HA sections moved from lighting, rendering/exports, and deployment into [`home-assistant/light-state.md`](home-assistant/light-state.md) and [`home-assistant/publishing.md`](home-assistant/publishing.md) | MVP documents now contain only builder behavior; repeated "post-MVP" disclaimers removed |
| [`shared-walls.md`](builder/features/shared-walls.md) rewritten as "Arranging areas and merging walls" | Rotation, tucking, and RealAllWalls are one workflow |
| [`geometry-groups.md`](builder/features/geometry-groups.md) rewritten around guides and derived geometry | Owns the floor shape → walls → RealFloor/RealWall/RealAllWalls model |
| `FloorReal` renamed to **RealFloor** everywhere; RealWall and RealAllWalls added | Consistent naming chosen with the owner |
| [Decision register](decisions.md) restructured: one summary table, one entry per decision with status, basis, and conventions | Removed the split confirmed/open/deferred tables and duplicated IDs |
| Status vocabulary simplified (Requirement / Resolved / Implementation convention / Post-MVP / Illustrative) | "Proposed" and "Recommended" had become ambiguous once D13 was resolved |

## First pass — 2026-11-14 (summary)

- **Restructuring:** the original flat documents were split into product, architecture, builder, delivery, design-system, and Home Assistant sections. Requirements were separated from proposals, and a decision register was added.
- **Gaps fixed:** stable boundary references replaced index-based edges. The floor sample gained its missing revision, and the ensure-floor operation was made explicit and idempotent.
- **New owning documents:** the editing lifecycle, undo/redo, shared walls, and a display contract.
- **Owner decisions:** D01, D03, D11 (MVP), D12, and D13 were resolved during that pass.
