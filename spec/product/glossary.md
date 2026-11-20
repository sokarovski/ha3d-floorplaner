# Domain glossary

Updated: 2026-11-20 (material preset wording).

Status: terminology consolidated from the feature specifications and the built app. Field names are those of the schemas in `shared/domain/schemas/` ([model](../builder/model.md#document-tree-ids-and-the-entity-index)); other type spellings are implementation conventions.

| Term | Meaning |
| --- | --- |
| House / project | One saved home and its assets. These terms refer to the same storage unit; `project.units` means the house-level display/input unit. |
| Building floor | A level such as `Etage1`: one entry in the house's `floors` list in `house.json`, with a stable ID and its name as a property. For MVP, each is an independent scene; only one is rendered at a time. |
| Area | A named part of a building floor, such as Living Room, Staircase, or Garden. Owns a floor shape (with its carpets), walls, objects, object groups, lights, and, for a staircase area, a staircase. Called a room in the UI. Naming an area Garden does not yet define terrain behavior. |
| Floor shape / footprint | The area's basic 2D contour, the union of its editable source shapes. A construction guide, not the rendered floor. In the tree, an ordinary area's **Floor** row opens it, not another building floor. |
| Geometry group | An element's local geometry/children plus its transform relative to a parent. Bounds are derived from children; moving a parent carries them together. Not an object group. |
| RealFloor | Derived floor geometry: the floor shape, enlarged to the outer faces of walls that extend beyond it, minus staircase openings. Without walls it equals the floor shape. Never edited directly. |
| RealWall | One wall's derived solid: its thickness band, height, and openings. Used for picking and provenance. Never edited directly. |
| RealAllWalls | The floor-level compound wall mesh: all RealWalls merged where they clash or touch, with contact faces removed, room-side materials, the roof's clipping (walls risen to it), and caps. This is what is rendered. |
| Tuck | Placing an area by picking a wall face (inner or outer) and a face on another area's wall; the area rotates and moves so the faces coincide. |
| Wall alignment | Where a wall's thickness sits relative to its floor-shape edge: outside (default), inside, or center. |
| Internal unit | One length unit equals one millimeter, including fractional values. Display-unit changes do not rescale stored geometry. |
| Wall | A guide extruded from a straight floor-shape edge, anchored to that source edge with a span. Height, thickness, alignment, openings, wall features, and side materials belong to it. |
| Wall feature (relief) | A group of 2D shapes on one face of a wall, combined into one outline, with one signed depth (positive: a box sticking out; negative: a niche; zero: flat colour) and one material. Stored in `wall.reliefs` ([D21](../decisions.md#d21-wall-reliefs), [wall relief groups](../builder/features/wall-relief-groups.md)). |
| Carpet | A `Floorable` surface on an area's floor with its own position, rotation, and material, made of one or more shapes that combine into one outline. Stored in `area.floor.carpets`. |
| Object group | A named set of two or more floor or overhead objects of one area, selected, moved, and turned as one; members keep their own placement. Stored in `area.objectGroups` ([object groups](../builder/features/object-groups.md)). Not a light group. |
| Hide / Hidden | Two ways to stop drawing an element (Phase 7.5). **Hide**: session-only (tree eye, ⇧H), never saved. **Hidden**: a saved Yes/No property; not drawn unless the builder's Show hidden is on (then faded), never in the HA viewer or exports. In the builder a hidden light keeps shining; the HA viewer leaves it out entirely. See [floor builder](../builder/screens/floor-builder.md#hide-and-hidden). |
| Light group | A floor-level named set of lights (`floor.lightGroups`) whose enabled state, brightness, and colour can be set together. Not an object group. |
| Entity index | The ID → entity map of a house document (kind, path, owning floor/area/wall/carpet/feature). Commands and history address entities through it, never by array index. |
| Schema version | The `house.json` format version (currently 4). Older files are migrated on open ([model](../builder/model.md#schema-versions-and-migrations)). Distinct from a document revision and a template version. |
| Template / object template | A reusable glTF 2.0 object asset in the house's template library (or built in), plus Homeplan metadata: contract, direction, resize modes, part rules, attachment, opening, and material slots ([D17](../decisions.md#d17-object-asset-format-and-template-metadata)). |
| Instance | One placed object with its own stable ID, template/version reference, parameters, and placement. |
| Surface material | The appearance stored on one surface in glTF material format: image texture, tint, shininess, metallic, and its tile size, rotation, and offset. |
| Material preset | A named copy of a surface material saved with Save current as preset in the material chooser; applying it copies the values to another surface. |
| Property schema | The JSON Schema for one object type: its properties, types, limits, and `x-homeplan` editor annotations. Drives the property panel and validation. |
| Property group | A collapsible section of the property panel (General, Placement, Size, Appearance, …), named by ID from one shared catalog so the same group reads the same on every type ([property system](../builder/property-system.md#property-groups)). |
| Mixed | What a field shows when the selected objects hold different values for it. A commit sets all of them as one undo step. |
| Property editor | A reusable editor template for one value (text, number, length, select, slider…), chosen by a property's metadata. |
| Schema form | The design-system form builder: renders a JSON Schema with property editors. Used live by the property panel and buffered by every popup form. |
| Popup | The design-system dialog with header (title, close) and footer (Cancel, Save, or a custom footer). |
| Homeplan metadata | The application's properties stored in a template's glTF `extras`. Replaces the earlier term "spatial wrapper". |
| Slice | A resize mode that keeps the start and end bands of an axis fixed and stretches only the middle; the 3D form of 9-slicing. |
| Touching / Full clash | The two push detents between neighboring walls: walls side by side (thicknesses add) or one wall inside the other (thicker thickness). |
| Image library / template library | The house's two reusable, server-owned asset collections: images in `textures/` (index `images.json`) and templates in `assets/templates/`. Usable on every floor and area of that house. |
| Revision | A Git commit of a house folder, created by an explicit Save and restorable from the History panel. |
| `Areable` | An area-owned object that does not cut a wall. It may still attach to one. A wall-mounted AC is an example. |
| `Wallable` | A wall-owned object, such as a window, that defines a wall opening and fits its host depth. |
| `Floorable` | A flat 2D shape hosted by an area's floor and lying on it, such as a carpet. The floor counterpart of `Wallable`; it cuts nothing. |
| `Staircasable` | A staircase template instance hosted by a staircase area. The area's opening and stair geometry are distinct. |
| Ownership | Where an object belongs in the document/tree. Distinct from attachment: an area-owned TV can reference a mounting wall. |
| Controllable (post-MVP) | A declared interaction target with a stable local ID and supported click/long-click/double-click gestures. Contains no entity/action binding. |
| Visual-state target | An object whose appearance can follow runtime state, such as a light. It can exist without a controllable gesture. |
| Light / emitter / fixture | A logical light has state and identity; emitters illuminate the scene; optional fixture geometry makes it visible. |
| Render set | Outputs generated from one frozen scene/assets/camera/environment/light-state snapshot. |
| Selection / focus / mode | Respectively, the current property target, viewport framing/isolation, and active editing workflow. |
| Edit levels | The nested editing contexts of the Floor Builder, each entered by a double-click and left with Done (or a double-click outside): the **Overview** (whole floor), the **Room Editor** (one area), and inside it the **Carpet Editor** (one carpet's shapes), the **Wall face** view (one wall face seen straight on), and the **Feature Editor** (one wall feature's shapes, from the wall face). An object group can be **opened** by double-clicking a member, to select and move members one by one. Escape cancels only operations, never leaves a level. See the [Floor Builder](../builder/screens/floor-builder.md#mode-2-room-editor). |
| Walls off | A session-only header toggle that hides every wall and its doors and windows and traces its footprint on the floor, to align rooms; wall-attached objects stay drawn in place ([Floor Builder](../builder/screens/floor-builder.md#walls-off)). Never saved; exports always include walls. |
| Light pin | An editor helper on every light: a screen-sized badge with the light type's icon, a stem to the floor, and a floor dot (plus a capsule along a linear light). Picked in screen space; never exported ([lighting](../builder/features/lighting.md#finding-and-picking-lights-in-the-editor)). |
| Light handles | The handles of a selected light: Move, Raise, Stretch (linear), and Aim (spot); turning is the Rotate tool ([lighting](../builder/features/lighting.md#light-handles)). |
| Light controls | The session-only three-state header switch for light helpers: **Hidden** (no pins or handles; the default), **Shown**, and **Focus** (everything else dims; only lights respond). It does not switch the lights' illumination. |
| Lights on/off | The session-only header toggle that switches every artificial light off in the view without changing any saved light (Phase 7.9); starts off in each session (owner, 2026-11-17). |
| Magnetic | Proximity snapping controlled by the editor. Independent of grid visibility and physical units. |
| Roof cut | The Phase 2 non-destructive upper-geometry modifier, replaced by roofs in Phase 19.2 (schema version 6). |
| Cuts walls / Walls rise | A roof's modes (Phase 19.2): its underside limits its floor's walls; walls under it extend up to the underside. |

Keep existing contract names while designing the model. Renaming them or replacing them with a capability-only design would be a separate decision, not a documentation cleanup.
