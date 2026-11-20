# Floor Plan Builder

Updated: 2026-11-18.

Status: the builder is the whole MVP ([D01](../decisions.md#d01-first-useful-release)); phases are defined in [MVP scope](../product/mvp-scope.md), including the [owner additions](../product/mvp-scope.md#owner-additions-after-the-initial-phases) of Phases 3–6. All Home Assistant work is post-MVP, except the [HA viewer MVP](../home-assistant/viewer-mvp.md) ([D23](../decisions.md#d23-ha-viewer-mvp)), which reads houses but does not edit them.

## Main workflow

This is the owner's authoring workflow. Every builder feature serves one of these steps.

1. **Open a house.** On the [Houses screen](screens/houses.md), select or create a house. A new house starts with `Etage1` and opens in [Floor Builder](screens/floor-builder.md).
2. **Draw the floor shape.** Measure a room, then trace its floor in Room Editor with rectangles, circles, and the polygon pencil (for triangles and irregular rooms), using typed dimensions and [measuring guides](features/measurement-guides.md). The floor shape is a guide; RealFloor is derived from it.
3. **Extrude walls.** In Room Editor, pull walls up from the floor shape's straight edges and circle arcs ([D20](../decisions.md#d20-walls-on-circles)), or fill every free edge at once with Fill walls. Set each wall's alignment (inside, outside, or center), height, thickness, and interior/exterior materials. Walls are guides; their geometry is RealWall.
4. **Arrange areas.** Draw and wall the other rooms the same way, then place them on the floor. Rotate an area if needed and tuck any inner or outer wall face against another area's wall. Clashing walls merge into the floor's RealAllWalls mesh, and each side keeps its room's material ([arranging areas and merging walls](features/shared-walls.md)).
5. **Furnish each area.** Add doors and windows (`Wallable`), ornaments and appliances (`Areable`, which can be [grouped](features/object-groups.md)), carpets (`Floorable`), lights, and wall features (boxes and niches on a wall face, [wall relief groups](features/wall-relief-groups.md)) to each area. Assign [image textures](features/house-images.md) and configure the [house environment](features/house-environment.md).
6. **Save, view, export.** Working writes and Undo run throughout; Save creates a Git revision ([editing lifecycle](editing-lifecycle.md)). Orbit the open-top view and export PNGs; in Phase 2, request a photorealistic render ([rendering and exports](../delivery/rendering-and-exports.md)).

Phase 2 adds the [Object Editor](screens/object-editor.md), a separate workflow that imports a GLB/glTF or STL model and saves it as a reusable template for step 5. It also adds staircases (since Phase 16.14 [stairs and floor openings](features/staircase-areas.md), objects that cut the floors they reach) and roof cuts ([superseded](features/roof-cutouts.md) by [roofs](features/roofs.md) in Phase 19.2).

## Guides and derived geometry

| Authored (guides, persisted) | Derived (regenerated, never edited) |
| --- | --- |
| Floor shape: source shapes and transforms | **RealFloor**: floor shape enlarged to the outer faces of outward walls, minus the cuts of stairs and floor openings |
| Walls: source-edge anchor, span, alignment, height, thickness, materials | **RealWall** (per wall) and **RealAllWalls** (merged per floor) |
| Area transforms (position, rotation) | Shared-wall contacts and merged faces |
| Objects, openings, carpets, lights, roofs | Object meshes, wall apertures, emitters, roof meshes, walls trimmed and risen to the roof |

Data flows one way, from guides to derived geometry. See [geometry groups](features/geometry-groups.md).

## Editor structure

- **Header:** editing level and breadcrumb, view and light controls (grouped dropdowns), undo/redo, History, Export, save problems only, Settings and Save (enabled when there is something to save).
- **Left:** a context-aware vertical toolbox, floating over the viewport's left edge, with the camera buttons pinned at its bottom.
- **Center:** the active viewport, with the view gizmo at the bottom left.
- **Upper right:** the house tree.
- **Lower right:** the properties of the selection.

Regions are cards on the canvas, separated by space rather than lines ([design system](../design-system/README.md#1-visual-direction-and-scope)).

The properties panel is generated from each object type's property schema ([property system](property-system.md)). Selection, focus/isolation, and editing mode are distinct actions; see the [Floor Builder screen](screens/floor-builder.md#selection-focus-and-mode-changes).

The hierarchy is House → building floors → areas → floor shape (with carpets), walls (with openings and wall features), objects (and object groups), lights. Light groups sit under their building floor. Only the active floor is rendered; switching floors replaces the scene. See the [document model](model.md) and [glossary](../product/glossary.md).

## Feature specifications

| Feature | Owns | Phase |
| --- | --- | --- |
| [Units and grid](features/units-and-grid.md) | Project units, mixed-unit fields, 1 unit = 1 mm, ground grid | 1 |
| [Geometry groups](features/geometry-groups.md) | Groups and transforms, floor shape, wall anchoring and alignment, RealFloor/RealWall, polygon pencil | 1 |
| [Measurement guides](features/measurement-guides.md) | Tape, typed distances, guide lines and points | 1 |
| [Arranging areas and merging walls](features/shared-walls.md) | Move/rotate/tuck, push detents, RealAllWalls, face materials, openings in shared walls | 1 |
| [Materials and objects](features/materials-and-objects.md) | Surface materials, wall thickness/alignment, `Wallable`/`Areable`, carpets | 1 |
| [Object groups](features/object-groups.md) | Two or more floor objects of one area moved and turned together | 5 (owner addition) |
| [Wall relief groups](features/wall-relief-groups.md) | Wall features: boxes and niches on a wall face, drawn from several shapes merged into one outline ([D21](../decisions.md#d21-wall-reliefs)) | 5 (owner addition) |
| [Ambient effects](features/ambient-effects.md) | Stop-motion swirls and vapour on objects every 20 s ([D24](../decisions.md#d24-ambient-effects)) | 7 (owner addition) |
| [Object templates](features/object-templates.md) | The reusable object library: glTF template format, Homeplan metadata, resizing/slicing, part rules, flips, openings (import UI is Phase 2) | 1 |
| [House images](features/house-images.md) | JPEG/PNG/WebP upload, the reusable image library, mapping | 1 |
| [Lighting](features/lighting.md) | Fixtures and emitters, output units, linear lights, color modes, light groups | 1 |
| [House environment](features/house-environment.md) | Location, north, fixed/current time, sunlight | 1 |
| [Stairs and floor openings](features/staircase-areas.md) | `Staircasable` stair objects and floor openings; automatic floor cuts | 2, 16.14 |
| [Yards](features/yards.md) | Yard areas: Add yard, lawn, fences and gates (glTF, repeated), pathways, no slab, outdoors for lighting | 17.2 |
| [Roof cutouts](features/roof-cutouts.md) | Superseded by roofs (Phase 19.2); the no-ceilings rule | 2 |
| [Roofs](features/roofs.md) | Roof objects: a sheet with break lines and pulled points, closed and open designs, the roof editing level | 19.1 |

Cross-cutting rules come from the [technical environment](../architecture/technical-environment.md), [renderer](../architecture/renderer.md), [persistence](../architecture/persistence.md), and [design system](../design-system/README.md). Feature documents link to these rules rather than restating them.

House metadata owns display units, environment, the default wall height, and the cap material. [Application preferences](../architecture/application-preferences.md) own the theme, colour scheme, ground grid, and navigation mode (Trackpad/Mouse). Editor UI state (tool, selection, open level, light controls) is session-only.
