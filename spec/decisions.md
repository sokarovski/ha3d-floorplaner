# Decision register

Updated: 2026-11-19 (D23 app packaging and discovery implemented).

Every product decision is now **Resolved**, **Resolved for MVP** (the MVP part is settled and named parts are deferred), or **Deferred** (post-MVP). No owner decision blocks MVP planning.

Each entry also lists **implementation conventions**. These are values or algorithms that the implementer chooses, documents in code and the owning spec, and tunes against the reference setup. Examples are a snap distance or the working-write delay. They are not open product questions. When a convention turns out to affect product behavior, raise it as a new decision rather than changing it silently.

Entries marked *Basis: review inference* were resolved during review passes by deriving them from confirmed decisions. The owner can still override them; record any change here and in the owning document together.

## Summary

| ID | Topic | Status | Result in one line |
| --- | --- | --- | --- |
| [D01](#d01-first-useful-release) | First release | Resolved | Builder-only MVP in two phases; HA work starts after the usability gate |
| [D02](#d02-reference-setup-and-representative-house) | Reference setup | Resolved | macOS + trackpad + desktop browser, local backend; a real home measured from scratch |
| [D03](#d03-coordinates-units-and-floor-local-geometry) | Coordinates and units | Resolved | One floor at a time; local groups; 1 unit = 1 mm; floor placement and slab (Phase 16) |
| [D04](#d04-footprints-walls-and-stable-boundaries) | Footprints and boundaries | Resolved | Floor shape and walls are guides; RealFloor/RealWall derived; walls anchor to stable source edges |
| [D05](#d05-walls-between-adjacent-areas) | Arranging areas, shared walls | Resolved | Move/rotate areas; tuck any wall face to any face; two push detents; merged into RealAllWalls |
| [D06](#d06-staircases-and-connected-floors) | Connected stairs | Resolved (Phase 16.14) | Stairs are objects; the floors they reach are cut automatically; linked stair references stay deferred |
| [D07](#d07-template-library-and-updates) | Templates | Resolved for MVP | House-scoped; instances pin a version; explicit adoption |
| [D08](#d08-lighting-and-groups) | Lighting | Resolved | Lumens, 0..1 brightness, Kelvin/sRGB, one active mode; groups are bulk-edit sets |
| [D09](#d09-saving-cancellation-and-model-undo) | Save and undo | Resolved | Full-JSON writes; explicit Save creates a Git revision per house; bounded session undo history |
| [D10](#d10-publishing-and-package-lifetime) | HA publishing | Deferred | Post-MVP |
| [D11](#d11-photorealistic-render-and-image-mode) | Photoreal render | Resolved for MVP | Optional backend render of the main view; HA image mode deferred |
| [D12](#d12-user-identity-and-access) | Users | Resolved | No users; all data and preferences are installation-global |
| [D13](#d13-application-stack) | Stack | Resolved | React/Vite, Fastify, React Router Data Mode, Zustand, typed fetch, Tailwind, hosted Three.js, TypeBox schemas, React Aria Components, npm + ESLint + Prettier; tests deferred |
| [D14](#d14-project-management-and-names) | Create/rename/delete | Resolved for MVP | ID-named house folders; one `house.json` with floors inside; server-owned asset indexes; deletes recoverable via trash, Undo, and Git |
| [D15](#d15-card-interaction-and-state-policy) | HA cards | Deferred | Post-MVP |
| [D16](#d16-interaction-defaults-and-support-limits) | Interaction defaults | Resolved | Click–lock–type–commit (click–move–click with typed values); trackpad-first navigation; Magnetic on; desktop-only; tree Add menus |
| [D17](#d17-object-asset-format-and-template-metadata) | Object format | Resolved | Every object template is glTF 2.0 (GLB); Homeplan metadata in `extras`; STL converted on import |
| [D18](#d18-property-schemas-and-the-property-panel) | Properties and forms | Resolved | One JSON Schema per object type ([object models](builder/object-models.md)); one schema-driven form builder for the live property panel and every popup form (`Popup`/`FormPopup`); live panel edits + Undo, no Cancel |
| [D20](#d20-walls-on-circles) | Walls on circles | Resolved | Walls are semantically raised from the floor outline (straight edges and arcs); derived geometry stays independent |
| [D21](#d21-wall-reliefs) | Wall reliefs | Resolved | Wall features: groups of 2D shapes on a wall face with a signed depth, built into the 2.5D wall slices |
| [D19](#d19-materials) | Materials | Resolved | Texture set directly on each surface (glTF material format + tile size, rotation, offset); Save as preset to reuse; JPEG/PNG/WebP |
| [D22](#d22-browser-agent-tools) | Browser agent tools | Resolved | Discoverable window wrappers reuse editor commands and resource clients; external agents interpret images |
| [D23](#d23-ha-viewer-mvp) | HA viewer MVP | Resolved for MVP | Read-only Lit + Three.js panel via `panel_custom`, dev mode from Vite, one live entity; production delivered in D27 |
| [D24](#d24-ambient-effects) | Ambient effects | Resolved for MVP | Stop-motion swirl or vapour on an object every 20 s; own entity, template defaults in glTF `extras`; HA binding through D25 |
| [D25](#d25-home-assistant-bindings) | Home Assistant bindings | Resolved | One binding per light, object, effect, or room (entity, actions, HA card condition, variants), authored in the viewer's Edit mode; dev preferences, HA production storage (D27) |
| [D26](#d26-self-describing-parametric-templates) | Self-describing templates | Resolved | Objects describe themselves: parameters, rules, and formulas live in the template; the app ships a fixed vocabulary; formulas now, sandboxed functions possibly later, no unsandboxed JS |
| [D27](#d27-production-ha-viewer-and-local-snapshots) | Production HA viewer | Resolved; implemented, owner check pending | Custom integration, private saved-house copies, one DEV MODE, house/panel Upgrade, HA-owned configuration |
| [D28](#d28-roofs-cut-walls) | Roofs cut walls | Resolved (Phase 19.2) | The top floor's roof limits its walls per planar piece; walls rise to it; doors and windows stay under it; roof cuts converted into roofs (schema 6) |

---

## D01 First useful release

**Status: resolved.** *Basis: owner.*

The first release is the floor-plan editing application only. It ships in two phases (see [MVP scope](product/mvp-scope.md)):

- **MVP Phase 1, core editor:** houses, floors, areas, shape and polygon footprints, measuring guides, walls and shared walls, materials and images, built-in glTF templates for doors/windows/objects with resize rules ([D17](#d17-object-asset-format-and-template-metadata)), carpets, lights and light groups, house environment, save/undo with Git revisions, and PNG export.
- **MVP Phase 2, extended authoring:** Object Editor with GLB/glTF and STL import, staircase areas, roof-profile cuts, and the optional backend photorealistic render.

**Usability gate:** use the editor on the representative home ([D02](#d02-reference-setup-and-representative-house)) and confirm that authoring is easy before starting packaging or any HA work. A Phase 1 check is recommended before Phase 2 begins.

**Exception (owner, 2026-11-16):** the read-only [HA viewer MVP](home-assistant/viewer-mvp.md) ([D23](#d23-ha-viewer-mvp)) starts now, alongside the builder. It does not change the builder gates.

**Post-MVP:** all HA work, including app/ingress packaging, integrations, cards, bindings, publishing, and image-layer delivery. Also post-MVP: connected floors, curved walls, house duplication, cross-house template libraries, and collaboration.

## D02 Reference setup and representative house

**Status: resolved.** *Basis: owner (device, input, plan source); review inference (browser, budget method).*

- **Builder device:** a macOS desktop/laptop. **Trackpad is the primary input**, with keyboard. Mouse support is best-effort; touch screens are out of scope.
- **Browser:** a current Chromium-based browser on macOS is the reference. Verify Safari before claiming support for it.
- **Backend:** runs on the same Mac (local Node process plus data directory). The HA host is post-MVP.
- **Representative house:** a real home, drawn from tape-measured interior dimensions. No plan-image import or tracing is in scope.

**Performance budgets:** do not invent numbers. During Phase 1, record the representative house's floor/area/object/light counts and asset sizes. Then measure frame rate during orbit, edit latency, load time, memory, and export time on the reference setup, and set budgets from those measurements. Owner: [deployment](delivery/deployment.md).

## D03 Coordinates units and floor-local geometry

**Status: resolved.** *Basis: owner.*

- A house may contain several building floors. The builder and every output show **one floor at a time**. Floors are independent scenes that are never stacked, and switching floors replaces the visible scene. **Phase 16 exception (owner, 2026-11-18), implemented:** each floor stores one placement relative to the house (plan offset and finished-floor elevation, no rotation) and a slab below its finished floor; the whole-house views (the builder overview for multi-floor houses and the HA exterior floor selector) show floors at their placements. Floor views keep the active floor in its own local frame, and only that floor is in the scene.
- Elements are **groups** with local child geometry and a placement/rotation relative to their parent. Moving a parent carries its children. Bounds are derived from the children; they never replace an irregular shape with a rectangle.
- **1 internal unit = 1 mm**, and fractional values are allowed. Display units never rescale stored geometry.
- Generated floor coverage (RealFloor) extends horizontally beneath outward wall thickness (outside- and center-aligned walls) without changing the measured room footprint.

**Implementation conventions:** axis names and signs, angle units and rotation order, origins/pivots, and the permitted rotation axes for each element type. Recommended: plan coordinates `(x, y)` with height `h` above the active floor's finished-floor plane at local zero. A meter-based Three.js adapter maps them to `(x/1000, h/1000, -y/1000)`. Owner: [model](builder/model.md), [geometry groups](builder/features/geometry-groups.md), [units](builder/features/units-and-grid.md).

**Floor placement and slab (Phase 16, owner 2026-11-18).** Implemented in the shared model: `positionMm` (plan offset, default `{ 0, 0 }`) and `elevationMm` (finished-floor elevation, default 0) place a floor's local frame in the house by translation only; floors are ordered by elevation (Up/Down). `slabThicknessMm` (default 200 mm, 0–1000, 0 = no slab) and `slabMaterial` (default Concrete) describe the derived slab, extruded downward from the finished floor over the union of the floor's RealFloor solids with the holes of stairs and floor openings ([model](builder/model.md#floor-placement-and-slab)). A new floor gets a one-time suggested elevation (lower finished floor + its tallest wall + the new slab's thickness); it is not a live constraint. The builder's whole-house overview and floor-group Move are implemented (Phase 16.4, [Floor Builder](builder/screens/floor-builder.md#whole-house-overview)); the HA whole-house view and animated floor transitions are implemented too ([HA viewer](home-assistant/viewer-mvp.md)). Stairs cut the floors they reach and take their suggested rise from the floor-to-floor gap (Phase 16.14, [D06](#d06-staircases-and-connected-floors)).

## D04 Footprints walls and stable boundaries

**Status: resolved.** *Basis: owner (guides vs. RealFloor/RealWall, floor-driven walls, alignment, curved walls deferred); review inference (boundary identity, holes, curves, pencil details).*

**Owner model: authored guides, derived real geometry.**

1. The **floor shape** is the area's basic contour, drawn from source shapes.
2. **Walls** are extruded upward from the floor shape's edges. Each wall picks its **alignment** relative to that contour: **inside**, **outside**, or **center** (half the thickness on each side). It then gets its height, thickness, materials, and other settings.
3. The floor shape and the wall settings are both construction **guides**. The real geometry is derived from them:
   - **RealFloor** is the floor mesh/polygon. It is built from the floor shape and the wall settings. Without walls it renders just the floor shape and its edge. Walls that extend outward (outside- or center-aligned) **enlarge** it to their outer faces. Staircase openings are subtracted.
   - **RealWall** is one wall's own derived solid (thickness band, height, openings), used for picking and provenance.
   - **RealAllWalls** is the floor-level compound mesh. All RealWalls on the active floor are merged where they clash or touch, contact faces are removed, and each exposed side keeps its room's material. The floor's roof (Cuts walls, [D28](#d28-roofs-cut-walls)) and caps are applied here. This is what is rendered and exported.

There are **no wall-driven floors**. Data flows one way: floor shape → wall guides → RealFloor/RealWall. A derived result never writes back into a guide, so no regeneration cycle can occur. None of RealFloor, RealWall, or RealAllWalls is persisted as editable data.

- **Source shapes:** rectangle (Shift constrains it to a square), circle, and closed polygon (pencil). Triangles and other irregular shapes are drawn with the pencil (owner decision). Every shape keeps its ID, local transform, and parameters. Polygon vertices have stable IDs.
- **Stable boundary identity:** each wall references a **source edge**: shape ID plus edge key, where the edge key is the fixed edge name for primitives and the vertex-ID pair for polygons. It also stores a span along that edge whose ends are attached to the edge's corners: each end is `{ anchor: start | end, offsetMm }`, so walls follow the floor when it is resized (owner decision, Phase 3 feedback; `house.json` schema version 2 with a migration from absolute spans). The boundary of a union consists only of portions of source edges, so a wall's visible extent is its span intersected with the part of its source edge that lies on the union boundary. Shape edits and transforms never redirect a wall to another edge.
- **Shape conversion (Phase 3):** converting a rectangle to a polygon (Corner edit) keeps the shape ID and re-anchors its walls from the named edges to the identical vertex-pair edges in the same command. This is an explicit, geometry-preserving conversion, not a silent remap.
- **Orphaned walls:** if a wall's source edge is no longer on the boundary (it became interior, or its shape was deleted), keep the wall and its hosted objects. Mark it as needing repair, exclude it from the generated geometry, and offer reassign/delete. Never remap it silently.
- **Several walls per edge:** a source edge can host several walls with non-overlapping spans (created by Split). Dragging a wall's vertical end line trims or extends its span; dragging an open end past a corner creates a new wall section on the next edge; pushing it onto the other end line removes the wall ([Floor Builder](builder/screens/floor-builder.md#trim-extend-remove-and-split-walls-with-their-vertical-lines)).
- **Collinear pieces:** a straight boundary line made from several source edges receives one wall per source-edge piece. Adjacent collinear walls with equal properties join seamlessly. Shift-raise applies to all pieces.
- **Holes and components:** holes and disconnected components that result from the union are valid and preserved. Hole boundaries can host walls. There is no subtractive-shape tool in MVP; stairs and floor openings (Phase 16.14) are the only explicit floor-hole mechanism. Point-only contacts produce separate components.
- **Curves:** circles are discretized for union and rendering. Walls can be raised on arcs as well as straight edges ([D20](#d20-walls-on-circles), Phase 3); openings on curved walls are deferred.
- **Polygon pencil:** click vertices; close by clicking the start vertex or pressing Enter (at least 3 non-collinear points); Escape cancels. Self-intersecting polygons are rejected with feedback. After commit, vertices can be dragged and inserted/deleted. Bounding-box resize scales the vertices about the shape's local origin.
- **Invalid edits** (empty or degenerate results) keep the last valid footprint and show feedback.

**Implementation conventions:** polygon kernel (Clipper2-style integer booleans; recommended fixed-point scale 1 unit = 0.001 mm), circle chord tolerance (recommended ≤ 1 mm), and collinearity and vertex-merge tolerances (physical, not zoom-dependent). Owner: [geometry groups](builder/features/geometry-groups.md), [model](builder/model.md), [Floor Builder](builder/screens/floor-builder.md).

## D05 Walls between adjacent areas

**Status: resolved.** *Basis: owner (arrange/rotate/tuck workflow, RealAllWalls, materials, snap outcomes); review inference (tuck mechanics, separation rule, kernel, junction scope, openings, caps).*

**Confirmed workflow (owner):**

1. Draw and wall each area separately.
2. Place the areas next to each other, rotating an area about the floor's vertical axis if needed.
3. Touch any inner or outer face of a wall and tuck it against any inner or outer face of another area's wall.
4. The clashing walls merge into the floor-level compound mesh **RealAllWalls**: each exposed side uses the interior material of the room it faces, and touching faces omit their internal contact faces. This applies to the preview and to all outputs.

**Tucking (revised, Phase 3 owner feedback):** there is no separate click-to-tuck tool. A tuck is a Nudge drag that grabs a wall's inner or outer edge and snaps it flush onto another room's inner or outer edge; one undoable command. Drag and drop is the way to align rooms: when the grabbed edge comes near another room's edge at a small angle, the room rotates about the grab point to make them parallel and snaps flush in the same drag (Alt suppresses the rotation). The Rotate tool remains for deliberate rotation. Arrangements that push a wall into another room's floor shape (for example inner → inner) are allowed but flagged, with a one-click "snap to shared wall" fix. Area rotation uses the Rotate tool's grips: quarter-turn locks near the marks, free elsewhere, Shift quarter turns only, Ctrl no snapping (owner, Phase 4; supersedes the 15° steps and wall-angle snaps). The face-combination table is in [shared walls](builder/features/shared-walls.md#what-face-combinations-produce).

**Push detents, as shortcuts with separations derived from the confirmed results.** Dragging an area by a wall-line handle toward a neighbor whose facing wall is parallel gives two detents:

| Arrangement | Room-boundary separation | `20 + 20 cm` | `20 + 40 cm` |
| --- | --- | --- | --- |
| Detent 1: **Touching** | `tA + tB` (the outer faces coincide) | `40 cm` wall | `60 cm` wall |
| Anywhere in between (partial clash) | between `tA + tB` and `max(tA, tB)` | `20`–`40 cm` | `40`–`60 cm` |
| Detent 2: **Full clash** | `max(tA, tB)` (the thinner wall lies completely inside the thicker one) | `20 cm` shared wall | `40 cm` shared wall |
| Pushed past full clash | less than `max(tA, tB)` | the wall pokes into the other room: flagged | flagged |

From Touching to Full clash, no wall enters either room. Only pushing past Full clash makes a wall intrude, which is flagged with the "snap to shared wall" fix (it moves the area back to Full clash). The rule is stated for outside-aligned walls, which is the default. For inside- and center-aligned walls, apply the same face relationships to the RealWall bands (outer faces coincide; the thinner band nests inside the thicker one) and derive the contour separation from them. Source thicknesses never change. Moving the rooms apart restores separate walls.

- **Kernel:** walls are vertical prisms, so prepare them as **2.5D**: union the wall footprints (2D polygon booleans) per height band, then extrude. Partial heights produce stepped tops. The floor's roof is applied afterward: walls rise to it and each planar roof piece clips them over its own plan region ([D28](#d28-roofs-cut-walls); before Phase 19.2, roof cuts were half-space clips). General 3D CSG is not required for MVP walls.
- **MVP junction scope:** parallel shared walls, L-corners, and T-junctions in any combination of areas on the active floor. Other arrangements (non-orthogonal multi-wall junctions) still render as their footprint union and are flagged when face ownership is ambiguous.
- **Openings:** a door or window belongs to exactly one authored wall, the one it was placed on. Its aperture cuts through the full prepared depth at its location, and its fitted depth equals that effective depth. The neighboring room sees the cut. The opening appears in its host's tree only; a reference in the other area's tree is optional. Overlapping openings from both sides are flagged as a conflict and never merged automatically.
- **Caps and reveals:** wall tops, exposed ends, junction caps, and opening reveals use one neutral **cap material** (per house, default plain white). Per-wall cap materials are post-MVP.
- **Picking:** prepared faces map back to the source wall that owns the face. Wall tops pick the wall whose footprint contains the hit point; inside a shared band, the moving or most recently selected wall wins.

**Implementation conventions:** snap capture distance (screen-space, recommended 8–12 px), push-through hysteresis, geometric contact tolerance (physical, recommended 0.5 mm, never zoom-dependent), and the batching strategy. Owner: [shared walls](builder/features/shared-walls.md).

## D06 Staircases and connected floors

**Status: resolved (owner, Phase 16.14, 2026-11-18).** A stair is an ordinary area object with a `Staircasable` template, placed in any room and moved like any object; there is no staircase area type. A derived, never-persisted step cuts floors automatically: a stair spans its floor's elevation to that plus its rise, and with **Cut floor above** (default on) every other floor whose slab band that span crosses loses the stair's footprint from its RealFloor and slab, moved between floors through their placements; **Cut floor below** (default off) cuts the floor it stands on. **Floor openings** are objects that cut their own floor. The rise is suggested once at insertion from the gap to the next floor above. Staircase areas migrate once (house schema version 5). Still deferred: explicit links between a stair and its destination floor, headroom checks, and L-shaped holes (the hole is the footprint rectangle). Owner: [stairs and floor openings](builder/features/staircase-areas.md).

## D07 Template library and updates

**Status: resolved for MVP.** *Basis: review inference from D01/D12.*

- Templates are **house-scoped**: each lives in `assets/templates/<template-id>/` with its original upload, shared geometry, and one glTF file per version ([D17](#d17-object-asset-format-and-template-metadata)). They travel with the house folder and its Git history.
- Built-in templates (Phase 1 doors, windows, objects, fixtures) ship with the application as read-only, versioned `.glb` files. Houses reference them by ID and version.
- Every instance pins `templateId` + `templateVersion`. Saving a template creates a new version and never changes placed instances.
- **Adoption is explicit:** the editor offers "Update instances to vN", per instance or for all instances in the house, as one undoable model command. Unchanged material-slot and control IDs are preserved; removed ones are reported before the update is confirmed.
- A template's default placement is applied only on insertion.
- Old versions are retained while any instance or history entry references them.

**Deferred:** a cross-house or installation-global library, export/import of templates between houses, and ID remapping. Owner: [Object Editor](builder/screens/object-editor.md), [object templates](builder/features/object-templates.md).

## D08 Lighting and groups

**Status: resolved.** *Basis: review inference; light groups are in MVP by the owner's choice.*

- **Units:** full output in **lumens**, brightness `0..1`, white temperature in **Kelvin**, and color as **sRGB 0–255**. A light has exactly one active color mode at a time: `fixedWhite`, `colorTemperature`, or `rgb`.
- **Emitters (browser preview):** bulb-like lights use `PointLight`, and spot lights (owner: in MVP, with heading, tilt, beam angle, and soft edge) use `SpotLight`, with luminous power converted from lumens. Straight linear lights use a row of 1–3 downward wide-beam shadow-casting `SpotLight`s plus, from Phase 12 (replacing the 8.9 unshadowed fill row), one analytic strip term (the diffuse light of a one-sided Length × Width rectangle in the PBR shader, confined by a reach and a clip plane), together sharing the strip's output, plus emissive strip geometry (Phase 7.10: `RectAreaLight` has no shadows in WebGL, so it lit neighbouring rooms through walls; see [lighting: strip light](builder/features/lighting.md#strip-light-phase-154)). A light may name its lamp type (Phase 8.9, [lamp types](builder/features/lighting.md#lamp-types)). Sampling a linear light into several emitters preserves its total output.
- **Shadows:** the sun always casts shadows. Artificial-light shadows are capped at a small number of shadow-casting lights for the active floor, with the cap measured on the reference setup. Lights beyond the cap illuminate without shadows. Since Phase 7.10 every emitter casts shadows within the texture-unit budget, linear carriers included ([light confinement](builder/features/lighting.md#light-confinement)).
- **Light groups (MVP):** a group is a named set of light IDs on one floor. A light can belong to several groups, and lights stay under their areas. In the builder, a group is a **selection and bulk-edit tool**: setting enabled, brightness, or color on a group writes those values to each member's own defaults as one undoable command. There is no persistent override layer, so no precedence rule is needed. Group-level runtime state and HA group mapping are post-MVP ([D15](#d15-card-interaction-and-state-policy)).

**Implementation conventions:** lumen-to-renderer conversion, falloff, the shadow-light cap, and Kelvin-to-RGB conversion. Proposed resource/shadow-update and sample-count optimizations ([lighting](builder/features/lighting.md#planned-led-strip-performance-phase-12)) stay within this decision; they are unimplemented experiments, not a change to authored light units, ownership or the current emitter model. Owner: [lighting](builder/features/lighting.md), [environment](builder/features/house-environment.md).

## D09 Saving cancellation and model undo

**Status: resolved.** *Basis: owner (no cross-tab collaboration, delegated undo design, full-JSON saves, Git-style revision history); review inference (timing, limits, durability, Git details).*

- **One editing session** per house. There is no cross-tab synchronization, merge, or shared history. Expected-revision checks and serialized writes remain integrity safeguards only.
- **Undo/redo:** the [model undo/redo design](builder/undo-redo.md) is adopted. Each committed command records one forward/inverse patch pair, and one session history spans all floors of the house document. Drafts and cancelled drags never enter history. Uploads, asset indexes, exports, server revisions, and Git revisions are outside history.
- **History bounds:** keep the latest 200 entries and evict the oldest coherently. Assets referenced by surviving entries are retained.
- **Full-document writes:** the client always sends the complete validated document (`house.json`), never patches.
- **Two save levels:**
  - **Working write (automatic):** about 1.5 s after the last committed edit, and before navigation and context switches, the full document is written to disk so a crash loses nothing. No revision is created.
  - **Save (explicit, ⌘S or the Save button):** writes the pending `house.json`, then creates one **Git commit** of the house folder. That commit is a restorable revision.
  - Status shows saving, written, saved, failed, or conflict, plus whether there are changes since the last Save. A failed write retries with backoff and keeps the local work.
- **Revision history (Git):** each house folder is a Git repository, managed by the backend with a pure-JavaScript Git implementation (isomorphic-git is the candidate), so no Git installation is needed. Commits use one fixed installation author because there are no users ([D12](#d12-user-identity-and-access)). The house's **History** panel lists revisions, shows which documents changed, displays a JSON diff, and restores a revision. Restoring writes that revision's files as a new working state and commits it as "Restore to …". It is never Undo, and later revisions stay in history. `house.json`, templates, image files, and the image index are committed; `exports/` and temporary files are ignored. A Git repository is ordinary files in the house folder and is not treated as a database.
- **Room editing (owner, 2026-11-15):** one Room Editor combines floor and wall tools. Enter by double-clicking a room or its tree pencil; leave by Done or double-click outside. Exiting keeps committed edits; there is no session-wide Cancel/Discard or entry snapshot. Undo reverses individual commands. Floor/Walls magnifiers are removed; doors/windows remain children of their host walls, and each deletable tree row has a trash action. This supersedes the earlier separate modal editors.
- **Drafts:** an invalid or uncommitted form draft blocks context switches until it is committed or discarded. Active pointer previews are cancelled by context switches.
- **Durability:** write a temp file, fsync it, rename it over the target, and fsync the directory. Acknowledge only after that sequence completes. On startup, remove stale temp files.
- **One document per house:** all model data lives in `house.json`, so every model command, including floor add, rename, and delete, changes one document and is ordinary undoable editing. Deleting a house is a single folder move, so no operation journal is needed.
- **Assets are server-owned:** the client never writes asset metadata into `house.json`. Uploads write the file and its entry in a server-owned index (`textures/images.json`; template folders under `assets/templates/`) and do not change the document revision. `house.json` references assets by ID only, so a full-document save never has to merge server fields ([D14](#d14-project-management-and-names)).

**Implementation conventions:** exact working-write delay and backoff values, history memory budget, the commit message format, and the pinned Git library release. Off-machine Git remotes (for example pushing to GitHub) are post-MVP. Owner: [persistence](architecture/persistence.md), [editing lifecycle](builder/editing-lifecycle.md), [undo/redo](builder/undo-redo.md).

## D10 Publishing and package lifetime

**Status: deferred (post-MVP) for the broader card/image publishing contract.** Covers how a card obtains models, images, and textures; dashboard independence from the builder; pinned versus following exports; authentication and URLs; and package formats. The active panel's production local-copy subset is resolved in [D27](#d27-production-ha-viewer-and-local-snapshots); do not reopen it here. Future notes: [HA publishing and packaging](home-assistant/publishing.md).

## D11 Photorealistic render and image mode

**Status: resolved for MVP (MVP Phase 2); HA image mode deferred.** *Basis: owner.*

The main active-floor toolbar has an optional **Render photorealistic image** action. It freezes the current floor, camera, lighting, and environment, submits a backend job, and displays the returned PNG. Editing and basic PNG export work without it. The renderer (Blender/Cycles is a candidate) and its tuning are implementation choices. Details: [main-view render](delivery/rendering-and-exports.md#main-view-photorealistic-render).

**Deferred:** HA image-layer compositing, light-state variants, and camera-aligned hit regions ([HA publishing](home-assistant/publishing.md#layered-image-mode)).

## D12 User identity and access

**Status: resolved.** *Basis: owner.*

The application has no users, accounts, profiles, roles, login, or per-user ownership. All houses, assets, templates, and preferences are installation-global. Preferences live in one document (`config/application-preferences.json`) behind `GET/PATCH /api/preferences`, with one global store. Do not build placeholder user abstractions. A future user layer would be a separate design. Resource, schema, and path validation remain required. Owner: [application preferences](architecture/application-preferences.md).

## D13 Application stack

**Status: resolved.** *Basis: owner.*

- **Stack:** React + strict TypeScript, Vite, React Router Data Mode, Zustand vanilla session stores with selector hooks, and typed fetch transport/resource clients.
- **Styling and rendering:** Tailwind semantic tokens with data-attribute selectors in `.tw.css`, and a small React viewport host around a typed Three.js `WebGLRenderer` runtime.
- **Backend:** Node LTS + Fastify.
- **Schemas:** authored in TypeScript with **TypeBox**, which emits standard JSON Schema (with `x-homeplan` annotations) and static types; Ajv validates in the browser and Fastify uses the same schemas for routes (owner, fourth pass).
- **UI behavior:** **React Aria Components** supply accessible behavior (Popup/Dialog, Menu, MenuButton, Tree, Slider, NumberField), styled only through our `.tw.css` data selectors (owner, fourth pass).
- **Tooling:** **npm** with a committed `package-lock.json`, **ESLint** (typescript-eslint, react-hooks, and an import-boundary rule) and **Prettier** (owner, fourth pass).
- **Testing:** no automated test stack in the initial baseline (owner, fourth pass). Verification scenarios in the specs remain the acceptance criteria and are checked manually until a test stack is chosen.
- **Not in the baseline:** Next.js, React Three Fiber, and TanStack Query (Query may be reconsidered when real server-cache needs appear).

**Implementation work:** pin compatible stable versions in `package-lock.json`, write the TypeBox schemas, implement the [API](architecture/api.md), and add the import-boundary lint rule. Owner: [technical environment](architecture/technical-environment.md), [frontend architecture](architecture/frontend-architecture.md), [state and data](architecture/state-and-data.md), [renderer](architecture/renderer.md).

## D14 Project management and names

**Status: resolved for MVP.** *Basis: owner (one JSON file per house, floor names as properties); review inference from persistence requirements.*

- **Houses:** created from the Houses screen with a display name. The folder name is the generated stable house ID (for example `h_7f3k2q`), never the display name, so renaming changes only `house.json`.
- **Floors:** stored inside `house.json` as a `floors` list (owner decision, replacing one folder per floor). Each floor has a stable ID and a `name` property. A new house is created with `Etage1`; new floors get the next free `EtageN`.
  - Names: trimmed, NFC-normalized, 1–64 characters, no control characters.
  - Names are unique within the house, compared case-insensitively.
- **Floor rename and delete:** ordinary undoable model commands; stable IDs are unchanged. The last remaining floor cannot be deleted.
- **Adding children:** every tree row that can hold children has an **Add** button alongside its other row actions. It opens a dropdown listing only the child types that row allows ([Floor Builder](builder/screens/floor-builder.md#adding-children-from-the-tree)). A new area is named `Area N` with the next free number, placed at the center of the view, and opens in Room Editor.
- **Areas:** create, rename, delete, and duplicate are ordinary undoable model commands. Area names need not be unique; IDs are. Duplicating an area allocates new IDs for the area and every descendant.
- **Deletion is recoverable:**
  - Deleting a house moves its folder to `<storage-root>/trash/` (outside `data/`, so it is never listed as a house).
  - A restore action is available. Permanent purge is a separate explicit action.
- **Images:** image files and their metadata (ID, display name, original filename, media type, pixel size, thumbnail) live in a server-owned index, `textures/images.json`, next to the files, not in `house.json` (owner decision in the fourth pass). An upload writes the file and then its index entry; files without an entry are removed on startup. An image can be renamed (display name only) and deleted only when nothing references it, including surviving history entries. Replacing an image's bytes is post-MVP.
- **Every house has a floor:** creating a house writes `Etage1` into its `house.json`, and the last floor cannot be deleted, so there is no separate ensure-floor operation. Listing never creates data.

**Deferred:** house duplication and import/export between installations. Owner: [Houses](builder/screens/houses.md), [persistence](architecture/persistence.md).

## D15 Card interaction and state policy

**Status: deferred (post-MVP).** Covers entity/action bindings, click/hold/double-click timing, gesture conflicts with the card camera, state fallback, unavailable entities, and group mapping. The builder keeps stable object and control IDs in the meantime. Future notes: [HA display contract](home-assistant/README.md), [controllables](home-assistant/controllables.md), [light state in HA](home-assistant/light-state.md).

## D16 Interaction defaults and support limits

**Status: resolved.** *Basis: owner (camera behavior, trackpad target, click–lock–type input model, automatic click/drag detection, opt-in click selection); review inference (gesture map, defaults, limits).*

**Camera (confirmed):** the main view orbits around the active floor's center and also pans and zooms. The floor layout offers Top (pan/zoom, orthographic) and rotatable 3D. Room Editor combines floor-shape and wall tools in one mode, with Top and 3D views; selecting a wall tool switches to 3D. Camera gestures never also edit geometry.

**Operation input model (owner, SketchUp-like):** every geometric command uses **click–move–click** with a lock and typed values. This covers extrude/raise, move, rotate, tuck, resize, trim/extend, and the pencil.

1. The **first click** starts the operation and **locks** it, so no button needs to be held. The direction is the tool's natural axis (vertical for extrude, along the edge for trim/extend, around the vertical axis for rotate). Nudge has three movement modes (owner clarification, 2026-11-15): **normal** retains automatic inference and edge/corner snapping governed by Magnetic; **Shift** constrains movement to the dominant red (floor X) or green (floor Y) axis, re-evaluated from the start-to-pointer displacement as the pointer moves; **Ctrl** releases axis constraints and bypasses all proximity/axis/edge snapping and alignment rotation. Ctrl takes precedence if both modifiers are held. Releasing a modifier immediately restores the remaining mode. Wall-mounted instances retain their host constraints.
2. While the operation is locked, the preview follows the pointer along that direction. **Typing a value** (any supported unit, for example `3m`, or degrees for rotation) appears in a value box. That value sets the exact distance or angle in the locked direction, replacing the pointer distance.
3. **Enter** commits the typed value. A **second click** commits at the current pointer position. **Escape** cancels with no history entry.
4. **Automatic click/drag detection (owner, 2026-11-15):** a plain initial press–release leaves the operation locked for a second click. If the pointer crosses the drag threshold while that initial primary press is held, release commits at the release position. Only movement during the held press counts; later hover movement cannot turn an earlier click into a drag. The pencil applies this per segment and still closes by clicking its first vertex or Enter.

Each commit is one undoable command. Field editing in the properties panel stays the alternative for numeric edits after the fact.

**Trackpad-first gesture map (macOS):**

| Action | Top view | 3D view |
| --- | --- | --- |
| Select; start/commit an operation | One-finger click | One-finger click |
| Pan | Two-finger scroll | Shift + two-finger scroll |
| Orbit | — | Two-finger scroll |
| Zoom (toward pointer) | Pinch | Pinch |
| Frame active floor / selection | `F` (double-click empty space frames only in overview) | `F` (double-click empty space frames only in overview) |
| Mouse fallback | Wheel zoom, middle-drag pan | Middle-drag orbit, Shift+middle pan, wheel zoom |

Browsers deliver pinch as `wheel` events with `ctrlKey` set, and two-finger scroll as `wheel` deltas. Distinguishing a mouse wheel from a trackpad is a heuristic, so let the user switch between "Trackpad" and "Mouse" navigation in preferences (default Trackpad). The orbit pivot stays fixed during drags, zoom is clamped to a range derived from the floor bounds, and the view never auto-recenters during edits. *Note (Phase 14.6):* the Home Assistant viewer follows this map too (the same `src/renderer/navigationInput.ts`, on its own orbit camera), adds primary-drag orbit and a touch map (one finger orbits, two pan, pinch zooms), and offers Trackpad / Mouse / Touch in its own Settings ([viewer navigation](home-assistant/viewer-mvp.md#houseviewer)); the builder is unchanged.

- **Magnetic:** on by default. It is one editor-session setting shared by all modes and also governs snapping to guides.
- **Auto-select (owner clarification, 2026-11-15):** a session-local toggle beside Magnetic, off by default. **Hover never selects in either mode. Off:** start Move/Rotate on the **existing selection**, preserving selected IDs and ignoring which object is under the cursor. **On:** if the clicked target differs from the selected targets, select it and **return without starting an operation**; if it is already selected, act on the selection exactly as Off. With A selected and the cursor over B, Off moves A; On first selects B, then a subsequent click on B can move B. Active operations retain their target until commit/cancel. See [the exact two-mode behavior](builder/screens/floor-builder.md#auto-select).
- **Shape tools:** Rectangle (Shift = square), Circle, Polygon pencil. There is no Triangle tool; the pencil and measuring tape draw triangles.
- **Measuring guides:** persisted per floor, so they reload with the floor. They can be listed, hidden, and cleared, and are always excluded from outputs.
- **Layout:** desktop only, minimum viewport 1280 × 720. There is no narrow-screen layout in MVP.
- **Number display:** enough decimals in the project unit to resolve about 0.1 mm (mm 1, cm 2, m 4, in 3, ft 4), with trailing zeros trimmed; `.` is the decimal separator. Fractional-inch and feet-inch compound input are post-MVP.
- **Upload limits:** images up to 25 MB and 8192 px on the longest side; model files (GLB/glTF or STL) up to 100 MB.
- **Render presets:** PNG export at 1×, 2×, and 4× of the viewport size, capped by the GPU's maximum texture size.

**Implementation conventions:** the click/drag threshold is 4 CSS pixels of maximum excursion while the initial primary press is held; zoom and snapping do not change it. Gesture sensitivities, zoom clamp factors, and the exact numeric limits are tuned on the reference setup. Owner: [Floor Builder](builder/screens/floor-builder.md#camera-controls-and-view-choices), [units/grid](builder/features/units-and-grid.md), [images](builder/features/house-images.md).

## D17 Object asset format and template metadata

**Status: resolved.** *Basis: owner (reuse an open standard rather than a project-specific format, with the application's own properties for direction, resizing, and stacking on top; keep reusing STL collections); review inference (glTF 2.0, `extras` placement, resize modes, part rules, storage).*

- **Format:** every object template, built-in or imported, is a **glTF 2.0** asset. Built-ins ship as `.glb`; each house template version is a valid `.gltf` file sharing one geometry buffer. Units and axes follow glTF (meters, +Y up, front +Z).
- **Standard features first:** part hierarchy and names, PBR materials, UVs, `KHR_texture_transform`, `KHR_lights_punctual`, and mesh compression come from glTF. Animations, skins, morph targets, cameras, and material variants are not used in MVP.
- **Homeplan metadata** sits in glTF's standard `extras` field: the scene carries the object contract (`Areable`/`Wallable`/`Staircasable`), attachment and contact, allowed flips, per-axis resizing (`fixed`, `scale`, `slice`, `fitHostDepth`), the opening, and material slots. Part nodes carry `pin`, `stretch`, and `repeat` rules, the last one for stacking such as stair steps or glazing bars.
- **Slicing** (the 3D form of 9-slicing) is done by the geometry core on vertices, so it works for any source format.
- **STL** remains an import format and is converted on import into the same structure after the user confirms its unit and orientation.
- **Phasing:** Phase 1 ships built-in templates and implements loading, validation, resizing, part rules, flips, openings, and material slots. Phase 2 adds import and metadata authoring in the Object Editor.

- **Parametric templates (Phase 9):** the metadata also carries a category, tags, product information, parameter help text and quick picks, boolean and choice parameters, live-state parameters, per-slot material choices, a mirror surface, named formulas, and the part rules `size`, `visible`, `rotate`, `translate`, and `face`, all under [D26](#d26-self-describing-parametric-templates).

**Implementation conventions:** the published JSON Schema for the metadata, supported compression decoders, and validation messages. **Post-MVP:** non-rectangular openings, animations (for example door swings), material variants as user choices. Owner: [object templates](builder/features/object-templates.md).

## D18 Property schemas and the property panel

**Status: resolved.** *Basis: owner (per-type property schemas and metadata, editor templates chosen by metadata, a dynamic property panel, `/ds` pages for every editor, live edits with Undo and no Cancel, the per-type [object models](builder/object-models.md)); review inference (JSON Schema, `x-homeplan` annotations, editor list, Ajv).*

- **Schemas:** every object type has one **JSON Schema** (draft 2020-12) property schema. It drives the property panel, validates edits, and composes the server's document schemas. Template instances combine the base instance schema with the parameters declared in their glTF metadata ([D17](#d17-object-asset-format-and-template-metadata)).
- **Metadata:** standard keywords supply type, label, default, limits, dropdown choices, and `readOnly`. One annotation keyword, `x-homeplan`, adds the editor, physical quantity, group and order, `hidden`, `visibleWhen`, `derived`, and data-driven `options`.
- **Types:** the properties of every object type are tabled in [object models](builder/object-models.md) (owner-approved); each table becomes that type's schema.
- **Editors:** the generic editors `text`, `number`, `length`, `angle`, `select`, `multiSelect`, `toggle`, `slider`, `color`, `vector2Length`, `dateTime`, `file`, and `readOnly` live in the design system. The domain editors `material`, `image`, `templateVersion`, `reference`, `location`, and (Phase 2) `nodeRef` live in feature code. All follow one contract and one registry, and each has a `/ds` page.
- **Panel:** walks the selected type's schema and renders each visible property with its editor; it has no per-type code. Multi-selection shows shared properties and **Mixed** values.
- **Forms:** the same schema-driven form builder (`SchemaForm`) renders every popup form in buffered mode inside the design system's `Popup` (header with title and close; footer with Cancel/Save or a custom footer) via `FormPopup`, given a values object and a JSON Schema configuration (owner, fourth pass). No form is hand-coded ([forms and popups](design-system/README.md#8-forms-and-popups)).
- **Editing:** live in the property panel. Each committed field is one undo step; sliders commit on release; Escape reverts only the field being typed in. There is no panel-wide Cancel and no cloned copy of the object.

**Implementation conventions:** schema `$id` naming, the Ajv release, and validation message wording. Owner: [property system](builder/property-system.md).

## D19 Materials

**Status: resolved.** *Basis: owner (image textures with scale, rotation, position, and shininess on any surface; no separate texture editor; Save as preset to reuse; follow an existing open format; accept open texture formats); review inference (glTF material format, copy-on-apply presets).*

- **On the surface:** every material slot (floor, wall side, cap, carpet, template slot) holds its own **surface material**. There is no separate material or texture editor: you select the surface and edit it in the property panel.
- **Format:** a surface material uses the **glTF 2.0 material** fields:
  - base color image (`baseColorTexture`) and color/tint (`baseColorFactor`)
  - roughness, shown as Shininess = 1 − roughness
  - metallic

  Its placement (tile size, rotation, offset) is in `extras.homeplan` and renders as the standard `KHR_texture_transform`. Templates use the same format for their own materials ([D17](#d17-object-asset-format-and-template-metadata)).
- **Presets:** **Save as preset** stores a named copy in `house.json` `materialPresets`. Choosing a preset on another surface **copies** its values, so the surface stays independent and can be adjusted. Built-in presets (plain white cap, default flooring, default wall paint, and the textured built-ins below) are read-only. Presets are renamed or deleted from the house properties; deleting one never changes surfaces.
- **Texture files:** JPEG, PNG, and WebP (`EXT_texture_webp`), uploaded to the house image library within the image limits ([D16](#d16-interaction-defaults-and-support-limits)).
- **Built-in textured materials (owner, 2026-11-18; Phase 17.1):** the app ships read-only textured presets (wood floors, tiles, granite, decking, lawn, paving) whose images are app-owned built-in textures (`builtinimg_…` IDs in `server/builtin-materials/`), available in every house like built-in templates. This is the only cross-house material library; a user-defined installation-global library (sharing a house's own presets or uploads with other houses) remains deferred.
- **Post-MVP:** normal, roughness, and other texture maps; KTX2 compressed textures; linked presets that update every surface; importing complete material files.

Owner: [materials and objects](builder/features/materials-and-objects.md#1-materials-and-image-textures), [object models](builder/object-models.md).

## D20 Walls on circles

**Status: resolved.** *Basis: owner (Phase 3 feedback, 2026-11-14), reopening the D04 deferral of curved walls.*

- **Semantic model:** a wall is raised from a piece of the floor's outline. In the data, every wall belongs to a source-edge piece of the floor shape, straight or curved (a circle's arc), and its ends are attached along that piece ([D04](#d04-footprints-walls-and-stable-boundaries) corner attachment). This is how the data is organized; it is not a statement about how the derived geometry is built.
- **Derived geometry is independent:** RealWall bands, RealFloor support, and RealAllWalls keep their own construction (bands by alignment and thickness, merging with neighbors, openings, the roof). A curved wall's band follows the same discretized outline the floor uses.
- **Circles:** raising a circle's outline gives one wall that follows the arc. Its ends are measured as arc length counterclockwise from the circle's local 0° point; a full ring has both ends there.
- **Open rooms:** leave parts of the outline unraised (a room with three walls), or trim/slide wall ends along the outline (on straight edges and arcs alike).
- **Deferred:** doors and windows on curved walls; curved polygon edges other than circles.

Owner: [geometry groups](builder/features/geometry-groups.md#walls-extruded-from-edges).

## D21 Wall reliefs

**Status: resolved.** *Basis: owner (Phase 5 feedback, 2026-11-15, H1) and review inference (implementation, Phase 5.0).*

- **Model:** a relief is a rectangle on one face of a straight wall (`interior` or `exterior`), placed along the wall from its span start and up from the floor, with a signed depth: positive is a box sticking out, negative a niche going in, zero a flat outline. It is a child of the wall (`wall.reliefs`, optional, no schema version change) with its own material, initially a copy of the face's.
- **Geometry:** RealAllWalls treats each relief as a prism in plan between its bottom and top. Boxes are added to the slice's band union and niches subtracted, measured from the visible face of the merged wall stack on that side (so on a shared wall a relief works from the face you can see). Openings cut last and go through boxes. A niche leaves at least 20 mm of wall behind it (deeper is flagged and drawn at that limit); a relief that leaves the wall's span or height, or sits on a curved wall, is flagged and not drawn. A box reaching into another room is flagged as an intrusion. The sides of a relief are faces owned by the host wall side and the relief (its material, and picking selects it); its horizontal faces are wall caps, like sills and wall tops.
- **Why rectangles:** walls are built as 2.5D height slices with a constant footprint each; a rectangle (and any rectilinear outline made of rectangles) fits that model exactly, while circles, arches, and slanted outlines would need a separate 3D boolean step.
- **Extended (owner, 2026-11-16, schema version 4):** a relief is a **feature**, a group of 2D shapes (rectangle, circle, polygon) on one wall face that combine into one outline with one depth (0 = flat colour, not extruded) and one material, edited with the same shape tools as areas and carpets. No subtractions yet. See [wall relief groups](builder/features/wall-relief-groups.md). The geometry cuts the outline into stacked rectangles, so the 2.5D wall model stays as described under Geometry.
- **Deferred:** shape subtraction in a feature; reliefs on curved walls; objects hosted in a niche; a relief that becomes a through-opening.

Owner: [object models: wall relief](builder/object-models.md#wall-feature-relief-group).

## D22 Browser agent tools

**Status: resolved.** *Basis: owner (2026-11-15).*

- Expose editor wrappers on `window.homeplan`, with a discoverable catalog describing function paths, JSON Schemas, examples, and focused Markdown guides.
- Agents call those window functions, including for resource reads and saving; Homeplan uses its existing configured resource clients to contact the backend.
- Use the same editor session, commands, authored model, undo/redo, working writes, and explicit Git revision saves as manual editing. Preserve in-progress manual work and reject stale edits.
- External agents interpret supplied images. Built-in recognition remains outside the original MVP scope. The bridge operates on an already open house.
- Owner addition: template import, draft inspection, and version saving are also window tools, using the existing glTF/STL import and validation clients before ordinary instance placement.

**Implementation conventions:** API version, session lifetime, generation checks, atomic batches, request-ID retention, and structured errors are owned by [browser automation](architecture/browser-automation.md). This is a JavaScript tool interface; it does not claim automatic support in every browser extension or implement an MCP server.

Owner: [browser automation](architecture/browser-automation.md).

## D23 HA viewer MVP

**Status: resolved for MVP; production delivery resolved and implemented in [D27](#d27-production-ha-viewer-and-local-snapshots).** *Basis: owner (2026-11-16; production brief 2026-11-17).*

- **What:** a read-only Home Assistant panel that shows one house's first floor on a Tesla-style dome stage you can orbit, plus one entity's live state as text. Spec: [HA viewer MVP](home-assistant/viewer-mvp.md).
- **Loading (current dev implementation):** one `panel_custom` block in `configuration.yaml` (`embed_iframe: false`, settings in `config:`). In dev mode the module is a TypeScript entry served by the Vite dev server with CORS for the HA origin. There is no HMR; development uses a manual browser reload.
- **Stack exception to [D13](#d13-application-stack):** the viewer is a separate front end built with Lit, Lit `css` blocks with Home Assistant theme variables, and a framework-free Three.js `HouseViewer`. No React, Tailwind, React Aria, or `SchemaForm`. It reuses `shared/` (contracts, schemas, geometry), the framework-free builder renderer modules in `src/renderer/`, and the existing API.
- **Setup storage:** currently `homeAssistant.viewer` in the installation-global builder preferences document ([D12](#d12-user-identity-and-access)). Production moves it to HA storage once, under [D27](#d27-production-ha-viewer-and-local-snapshots); the standalone dev adapter retains preferences.
- **Light mapping (owner, 2026-11-16):** each light object maps to an HA light entity for its state and to HA dashboard actions for click, long click, and double click, edited with HA's native pickers. Mappings are HA configuration stored in preferences (`homeAssistant.bindings`, per house and light ID), never in `house.json`. This settles the binding-storage part of [D15](#d15-card-interaction-and-state-policy) for the viewer; executing actions and state visuals follow. Generalised to objects, effects, and rooms with conditions in [D25](#d25-home-assistant-bindings).
- **Reactivity:** `hass` goes into a framework-free store with per-entity subscriptions; nothing re-renders on unrelated entity changes.
- **Production:** integration hosting, bundled viewer, authenticated local snapshots, unified DEV MODE and house/panel Upgrade are implemented (Phase 11), not deferred questions. Viewer bindings/actions follow [D25](#d25-home-assistant-bindings). The Home Assistant app packaging with ingress and Supervisor discovery is implemented ([publishing: implemented app](home-assistant/publishing.md#implemented-app)). Image-mode publishing ([D10](#d10-publishing-and-package-lifetime)) and the remaining full Tesla-style interface stay deferred.

## D24 Ambient effects

**Status: resolved for MVP; Home Assistant binding implemented in Phase 8 ([D25](#d25-home-assistant-bindings)).** *Basis: owner (2026-11-16: small animations every 20 s, a 3–4 s stop-motion wind-like swirl, red above a water heater or boiler, blue in front of an AC unit, later vapour above a dryer; "use your best judgement" for the rest); review inference (model, editing, rendering).*

- **What:** an **ambient effect** is a small looping animation attached to an Areable object, showing what the appliance is doing (heating, cooling, drying). Kinds: `swirl` (curled wind-like strokes, any colour) and `vapour` (soft rising wisps). Spec: [ambient effects](builder/features/ambient-effects.md).
- **Model:** an object's optional `effects[]` in `house.json`; each effect has its own ID (`fx_`), `kind`, `enabled`, `direction` (`up`, or `forward` along the object's front), `offsetMm` (`x` right, `y` forward, `h` up in the object's own axes, from the middle of its top or front face), `color` (sRGB 0–255), and `sizeMm`. It moves, turns, and hides with its object. Optional, so no house schema version change. A free-standing effect in an area is post-MVP.
- **Editing ([D18](#d18-property-schemas-and-the-property-panel)):** an effect is its own entity (kind `effect`), listed under its object in the tree, and edited through its own schema in the properties panel. The panel does not edit arrays of objects, so an effect is added with the object's **Add effect** selection action and deleted like any other row.
- **Templates ([D17](#d17-object-asset-format-and-template-metadata)):** an Areable template may declare default `effects` in its scene `extras.homeplan`; placing it copies them onto the new instance with new IDs. The built-in air conditioner has a blue swirl blown forward and the built-in water heater a red swirl rising above it.
- **Rendering:** procedural stop-motion frames in `src/renderer/` (no new asset format), shared by the builder and the [HA viewer](#d23-ha-viewer-mvp). Effects animate through view-only frames that never redraw the static shadow maps, are never in PNG or render exports, and show a still frame with `prefers-reduced-motion`.
- **Home Assistant (Phase 8, [D25](#d25-home-assistant-bindings)):** binding `enabled` (and colour) to Home Assistant states (AC cooling → blue swirl, boiler heating → red swirl, dryer running → vapour).

**Implementation conventions:** period 20 s, run 3.5 s at 8 frames per second over 7 drawings, the per-effect phase (a hash of the ID), the stroke shapes, drift, and fade steps, at most 8 effects per object. Owner: [ambient effects](builder/features/ambient-effects.md).

## D25 Home Assistant bindings

**Status: resolved.** *Basis: owner (2026-11-16, Phase 8 decisions Q1–Q3); review inference (schema shape, nesting limit, patch merge, editor layout).*

- **What:** one binding model for everything that reacts to Home Assistant in the [HA viewer](#d23-ha-viewer-mvp): lights, Areable objects, ambient effects ([D24](#d24-ambient-effects)), and rooms (bubbles join in Phase 8.5). Spec: [bindings](home-assistant/bindings.md).
- **Model:** per house and kind (`lights`, `objects`, `effects`, `areas`), one binding keyed by the builder's stable ID: `{ stateEntityId?, tapAction?, holdAction?, doubleTapAction?, visibleWhen? }` for lights, objects, and rooms (lights also `lumens?`, `kelvin?` from the Q1 amendment); `{ visibleWhen?, variants? }` for effects, where each variant is `{ when, kind?, color?, direction?, sizeMm? }` and the first that holds changes the look. Actions are HA's own dashboard action objects. A light whose `visibleWhen` fails is drawn off and ignores gestures. Object bindings (Areable objects and, from Phase 9.7, doors and windows) may also drive the template's live-state parameters (`x-homeplan.state`, [D26](#d26-self-describing-parametric-templates)): `states: { <parameter>: { entity?, attribute?, map } }`, where `map` is a value table, a threshold, or a linear range; the viewer draws the mapped value instead of the stored one (never saved), and no usable value keeps the stored one ([bindings: state parameters](home-assistant/bindings.md#state-parameters)).
- **Ownership (Q1):** the builder owns what a thing is (a lamp's fixture, type, lumens, beam, colour capability, default temperature); the HA binding owns what it is doing now (entity, on/off, brightness, colour within the capability, actions, conditions). HA never sets the type; lights take no variants. **Amended 2026-11-18 (owner, Phase 13.6):** HA Settings may override a light's lumens and, while its entity is no colour light (no `color_temp`, `hs`, `rgb`, `rgbw`, `rgbww`, or `xy` mode), its default colour temperature: optional `lumens` and `kelvin` on the light binding, installation-global, with the builder's bounds; the house values stay the defaults and `house.json` is never edited; brightness scales the overridden lumens once. Type, fixture, beam, and colour capability stay builder-owned ([light state](home-assistant/light-state.md#lumens-and-temperature-overrides)).
- **Storage (Q2):** HA configuration in the installation-global preferences (`homeAssistant.bindings[houseId]`, [D12](#d12-user-identity-and-access)), never in `house.json`. Additive migration on read (pre-8.0 houses have only `lights`; the other kinds are filled in empty, lights unchanged; `schemaVersion` stays 1). A preferences patch merges by house and kind. This describes the current dev adapter; [D27](#d27-production-ha-viewer-and-local-snapshots) plans HA-owned production configuration with a one-time preferences import, preserving these binding shapes/merge rules.
- **Conditions (Q3):** a subset of HA dashboard card conditions with HA's field names: `state` (`state` or `state_not`, one value or a list), `numeric_state` (`above`, `below`), `and` / `or` (`conditions`), plus an `attribute` extension on `state` and `numeric_state`. HA's semantics: a missing entity reads as `unavailable`; a non-numeric state fails numeric tests. Evaluated by a pure function in `shared/domain/homeAssistant/conditions.ts`; the viewer subscribes once per entity used.
- **Authoring (Q2):** an Edit mode in the viewer's top bar; tapping a light, object, or room opens its binding (HA's `ha-form` with entity, `ui_action`, attribute, state, and number selectors; plain controls outside HA); an object's ambient effects are bound in the object's popup; a list reaches everything on the floor. Save writes at once.

**Implementation conventions:** conditions nest at most three levels (a group inside a group; the schema is written out, not cyclic), at most 8 variants per effect, an empty `and` holds and an empty `or` does not, number and boolean attributes compare as text. Owner: [bindings](home-assistant/bindings.md).

## D26 Self-describing parametric templates

**Status: resolved.** *Basis: owner (2026-11-17, Phase 9: objects describe themselves and the app knows no object; formulas only in Phase 9; sandboxed functions possibly later; unsandboxed JS rejected); review inference (formula grammar, rule names, evaluation order).*

- **Principle (owner):** each template declares its own selectable properties (name, type, values, limits, defaults, help text, material choices) and maps them to its own geometry through rules and formulas in its metadata ([D17](#d17-object-asset-format-and-template-metadata) `extras.homeplan`). The app ships only a generic, fixed vocabulary: parameter types (length, number, on/off, choice), part operations (slice, stretch, pin, repeat, size, rotate, translate, show/hide, face, material binding), and the formula language. A new object, or a new option on an object, is a new template file and never an app change; the app changes only when a new kind of operation is needed. There are no per-kind code paths for furniture, doors, or blinds: a door's open angle or a blind's tilt is a parameter the template marks as live state, and Home Assistant bindings target those state parameters by name.
- **Model:** parts are glTF meshes; the model is the template's metadata (parameters, named formulas, part rules, product information); an instance is parameter values in `house.json`; the result is a derived mesh, never persisted. Modelled on SketchUp Dynamic Components.
- **Formulas now:** a rule value may be a side-effect-free expression over numbers and booleans (strings only to compare choice parameters), parsed and evaluated by a small hand-written parser in `shared/` (no `eval`, no `Function`). Formulas read the resolved parameters, named formulas, and the requested axis sizes; unknown names, unknown functions, wrong argument counts, type errors, and cycles are reported at import, save, and build.
- **Functions later:** a sandboxed function backend (for example QuickJS in WebAssembly) may be added later. Rules are shaped for it: every computable field takes a value that one evaluator turns into a number or a boolean from the same named inputs, so a function backend can replace a formula without changing the rules or the templates that use plain formulas.
- **Rejected:** unsandboxed JavaScript in templates. Imported GLBs would run code in the editor, and the [HA viewer](#d23-ha-viewer-mvp) runs templates with the user's Home Assistant session.

**Implementation conventions:** the formula grammar, function list, identifier names, rule order, the 500-character formula limit, and 1000 copies per repeat ([object templates](builder/features/object-templates.md#formulas)). Owner: [object templates](builder/features/object-templates.md).

## D27 Production HA viewer and local snapshots

**Status: resolved; implemented (Phase 11) and owner-accepted.** *Basis: owner (2026-11-17 brief and consolidated workflow: gradient/Setup your home, House setup/URL/Connect/Use, reactive sidebar, one DEV MODE for code and data, per-house Upgrade, panel frontend Upgrade); review inference (atomic storage, compatible artifact formats, loader/fallback recovery and existing HA authorization). This supersedes earlier draft descriptions of two dev toggles/two URLs.*

- **Install and first use:** Marketplace-compatible custom integration without YAML or a required source address. Owner terminology correction (2026-11-19): HA 2026.11+ includes Marketplace; no separate HACS installation is required. The technical repository manifest remains `hacs.json`; see [distribution and builds](home-assistant/production-integration.md#distribution-and-builds). Homeplan initially shows the existing globe/stage gradient and **Setup your home**. That opens the Settings sidebar at **House setup**, before any house/source exists.
- **Connection/selection:** one saved **Floor Builder URL**, **Connect**, then house rows with **Use this house** and **Upgrade**. Use validates/loads the chosen house and immediately updates its canvas/sidebar settings. Native Configure recovers the same settings, never a second source record.
- **One DEV MODE:** default off; on loads both remote viewer code and current server working house/assets from that URL on each fresh load. It persists until disabled. Off uses local viewer code and the selected stored house. Code-mode switches require full browser reload; normal house selection/upgrade populates the scene/sidebar reactively.
- **Fallback:** failed remote loads visibly use compatible local code and a stored copy of the same house, or setup if none exists. DEV MODE remains enabled and user Retry/refresh attempts remote again. A stable packaged shell and at most one guarded recovery reload avoid mixed custom-element implementations/reload loops.
- **House Upgrade:** an explicit action beside each house copies its latest explicit Git Save and complete assets/authored settings into HA, validates checksums and atomically activates the stored copy. It neither selects another house nor overwrites HA bindings/dashboard settings. In DEV MODE it updates the stored fallback copy without replacing the live working view.
- **Upgrade panel:** the same source can offer a compatible built production frontend bundle. HA verifies/stores it under `/config/homeplan/frontend`, selects it atomically, retains previous/shipped code and asks for browser reload. It updates UI modules/styles, not Python/backend dependencies; incompatible requirements request a normal integration update. No installed component files are overwritten.
- **Ownership/access:** HA's one installation-global revision-aware store owns selected house, shared connection/mode, bindings/dashboard, import markers and current/previous house/frontend pointers. Import legacy preferences once, preserve explicit empty values, and keep configuration in HA in all modes. Use HA authentication/admin checks; no Homeplan accounts or new builder authentication (D12).
- **Deferred:** background synchronization, multiple sources/entries, arbitrary revision/rollback browser, card/image packages, builder app packaging and wider publishing. Explicit house/frontend upgrades and native packaged-code recovery are in this phase.

**Implementation conventions:** bundle/snapshot identities, protocol/schema fields, stable loader handshake, bounded jobs/transfers, retention and recovery are owned by [production integration](home-assistant/production-integration.md). Routes are owned by [API](architecture/api.md#phase-11-snapshot-transfer-and-integration-api). Verify HA/Python/installer compatibility during 11.0; do not imply upstream references are tested releases.

## D28 Roofs cut walls

**Status: resolved; implemented (Phase 19.2).** *Basis: owner (2026-11-18 roof concept: Cuts walls, Walls rise to the roof default on, window limit, roofs replace the roof-cut tool); the per-piece regions, interior walls rising, and the migration rules are review inference.*

- **Cuts walls:** the top floor's roof (`roof.cutsWalls`, default on) is the height limit of its floor's walls. Each planar piece of the roof (faces and auto-fold pieces) limits the walls over its own plan region; outside the outline walls keep their height. Walls follow the underside along their length and across their thickness.
- **Walls rise to the roof** (`roof.wallsRise`, default on): walls under the roof extend up to the underside, gable ends to the ridge; users draw normal walls. Interior walls rise too; a per-wall option is deferred. Authored wall heights are never changed (derived only).
- **Window limit:** a door or window's top stays under the underside along its whole width on both faces: placing lowers it or refuses it, moving refuses, resizing stops at the underside; existing ones above it, and wall-mounted objects, objects and lights above it, are issues. Never clipped or moved automatically.
- **Roof cuts replaced:** the roof-cut tool, tree row and profile popup are removed. House schema version 6 converts each floor's active cuts into one roof reproducing their lower envelope (walls keep their heights; Walls rise off for it), or drops them when the floor has a roof. HA copies of versions 4 and 5 stay readable and are migrated on load.
- **Deferred:** attached canopies (Cuts walls off) on any floor, step lines, skylights and dormers (19.3–19.4); several cutting roofs per floor.

**Implementation conventions:** the 0.5 mm probe inside a wall face that decides which piece covers it, the step face where the outline crosses walls, Add roof's 400 mm overhang for migrated roofs (unless it would bring the envelope below the floor), and the sliver area below which a split band is dropped (1 mm²) are owned by [roofs](builder/features/roofs.md#the-roof-cuts-walls).
