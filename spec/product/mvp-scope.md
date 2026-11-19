# MVP scope and phases

Updated: 2026-11-19.

Status: resolved scope ([D01](../decisions.md#d01-first-useful-release)); later owner additions are listed [below](#owner-additions-after-the-initial-phases). This page describes what the MVP contains and how its completion is judged. It is input for MVP planning, not the plan itself. Task breakdown, estimates, and ordering inside each phase are planning work.

## Reference setup

The [D02](../decisions.md#d02-reference-setup-and-representative-house) setup:

- A macOS machine with trackpad and keyboard, running a current Chromium-based browser.
- The backend on the same machine.
- A real home, drawn from measured interior dimensions, as the representative house.

## MVP Phase 1: core editor

| Capability | Owning spec |
| --- | --- |
| Houses list, create/rename/delete with trash recovery | [Houses](../builder/screens/houses.md), [D14](../decisions.md#d14-project-management-and-names) |
| Floors (`Etage1`, add/rename/delete), one rendered at a time | [Floor Builder](../builder/screens/floor-builder.md), [persistence](../architecture/persistence.md) |
| Areas with shape footprints: rectangle/square, circle, polygon pencil (for triangles and irregular rooms); union into RealFloor | [Geometry groups](../builder/features/geometry-groups.md) |
| Measuring tape, guide lines and points | [Measurement guides](../builder/features/measurement-guides.md) |
| Walls raised from footprint edges: height, thickness, alignment, endpoint trim, floor support | [Materials and objects](../builder/features/materials-and-objects.md#2-wall-thickness-alignment-and-flooring-support) |
| Shared walls: Touching and Full clash detents, union, room-side materials | [Shared walls](../builder/features/shared-walls.md) |
| Tree Add menus for floors, areas, objects, carpets, lights, doors, and windows | [Floor Builder](../builder/screens/floor-builder.md#adding-children-from-the-tree) |
| House image library and surface materials | [House images](../builder/features/house-images.md), [materials](../builder/features/materials-and-objects.md) |
| Built-in glTF templates for doors/windows (`Wallable`) and objects (`Areable`): resizing, slicing, part rules, flips | [Object templates](../builder/features/object-templates.md), [materials and objects](../builder/features/materials-and-objects.md) |
| Carpets | [Materials and objects](../builder/features/materials-and-objects.md#6-carpets) |
| Lights (bulb and straight linear; visible fixture or invisible source) and light groups | [Lighting](../builder/features/lighting.md) |
| House environment: location, north, fixed/current time, sun | [House environment](../builder/features/house-environment.md) |
| Schema-driven forms: the property panel and popup forms, with property editors, each documented in `/ds` | [Property system](../builder/property-system.md), [workbench](../design-system/workbench.md) |
| Units, mixed-unit input, ground grid, theme | [Units and grid](../builder/features/units-and-grid.md), [design system](../design-system/README.md) |
| Full-JSON working writes, explicit Save as a Git revision, History panel with diff and restore, undo/redo | [Editing lifecycle](../builder/editing-lifecycle.md), [persistence](../architecture/persistence.md#revision-history), [undo/redo](../builder/undo-redo.md) |
| Preview and final PNG export (viewport quality) | [Rendering and exports](../delivery/rendering-and-exports.md) |
| `/ds` design-system documentation for every shared component | [Workbench](../design-system/workbench.md) |

**First vertical slice:** create a house, draw one rectangular area, raise walls, edit dimensions, place a window, assign a texture, save and reopen, export a PNG. Then add a second area and prove both shared-wall detents. The slice should establish the document store, command/undo layer, geometry core, renderer adapter, and save path that every later feature reuses.

## MVP Phase 2: extended authoring

| Capability | Owning spec |
| --- | --- |
| Object Editor: GLB/glTF and STL import, normalization, metadata authoring, template versions | [Object Editor](../builder/screens/object-editor.md), [object templates](../builder/features/object-templates.md) |
| Stairs (`Staircasable` objects) and floor openings, cutting floors automatically (Phase 16.14) | [Stairs and floor openings](../builder/features/staircase-areas.md) |
| Roof-profile cuts via the measured side profile (replaced by roofs in Phase 19.2) | [Roof cutouts](../builder/features/roof-cutouts.md), [roofs](../builder/features/roofs.md) |
| Optional backend photorealistic render of the main view | [Main-view render](../delivery/rendering-and-exports.md#main-view-photorealistic-render) |

## Usability gate

Before any HA or packaging work, the owner uses the editor on the representative home and confirms that the following tasks are easy:

- Draw and edit measured areas, including an irregular room.
- Join adjacent rooms with shared walls.
- Adjust walls and openings.
- Place objects, lights, and materials.
- Navigate with the trackpad and select.
- Save, reopen, and export without losing work.

This is a qualitative outcome, not an invented numeric target. A Phase 1 check against the same tasks is recommended before Phase 2 starts.

## Acceptance shared by every feature

- Geometry, openings, materials, and IDs survive reload and backend restart.
- Unit changes preserve physical dimensions.
- Drags preview and cancel cleanly; each committed edit is one undo step.
- Stale writes are refused; failed saves keep local work.
- Exports match the camera and never include helpers or ceilings.

## Outside the MVP

| Item | Where it is tracked |
| --- | --- |
| All Home Assistant work: cards, controllables UI, scene/image publishing, image layers (except the HA viewer, its bindings and production integration, and the HA app packaging described below) | [Home Assistant](../home-assistant/README.md), [D10](../decisions.md#d10-publishing-and-package-lifetime), [D15](../decisions.md#d15-card-interaction-and-state-policy) |
| Linked stair references between floors (floor placement, whole-house views and stairs cutting floors are implemented) | [D06](../decisions.md#d06-staircases-and-connected-floors), [D03](../decisions.md#d03-coordinates-units-and-floor-local-geometry) |
| Openings on curved walls, curved edges other than circles, subtractive shapes, reliefs on curved walls, multi-segment/addressable light strips | [D20](../decisions.md#d20-walls-on-circles), [D21](../decisions.md#d21-wall-reliefs), [geometry groups](../builder/features/geometry-groups.md), [lighting](../builder/features/lighting.md) |
| Cross-house template library, import/export between installations | [D07](../decisions.md#d07-template-library-and-updates), [D14](../decisions.md#d14-project-management-and-names); Clone house within one installation is implemented ([Houses](../builder/screens/houses.md)) |
| Plan-image tracing/recognition, CAD editing, weather simulation, collaboration, user accounts | [Product overview](overview.md#out-of-scope) |
| Mobile/narrow-screen layout and touch input | [D16](../decisions.md#d16-interaction-defaults-and-support-limits) |

## Owner additions after the initial phases

The owner's hands-on reviews added builder work in later phases. Each item is owned by the linked spec; the phase number labels the development step that added it.

| Phase | Added capability | Owning spec |
| --- | --- | --- |
| 3 | One Room Editor instead of separate area/wall editors; SketchUp-like inference; wall handles, trim/extend/split; walls on circles ([D20](../decisions.md#d20-walls-on-circles)); staircase direction; Nudge and Corner edit; click–drag detection and Auto-select | [Floor Builder](../builder/screens/floor-builder.md), [geometry groups](../builder/features/geometry-groups.md), [staircase areas](../builder/features/staircase-areas.md) |
| 4 | Rotate grips, arc–straight wall joins, shape snap points and handles, Fill walls and a house default wall height, Walls off, view gizmo, open-plan area splits | [Floor Builder](../builder/screens/floor-builder.md), [shared walls](../builder/features/shared-walls.md) |
| 5 | Wall reliefs (boxes and niches, [D21](../decisions.md#d21-wall-reliefs)) and multi-shape wall features, up-and-down stairwells, design-system redesign, light pins and handles, Pan and Orbit, the Carpet Editor, object groups | [Wall relief groups](../builder/features/wall-relief-groups.md), [object groups](../builder/features/object-groups.md), [lighting](../builder/features/lighting.md), [design system](../design-system/README.md) |
| 6 | Browser agent tools on `window.homeplan` (owner, 2026-11-15) | [Browser automation](../architecture/browser-automation.md) |
| 7 | One edit context stack, one 2D shape group, Hide, light confinement, ambient effects, Clone house | [Floor Builder](../builder/screens/floor-builder.md), [ambient effects](../builder/features/ambient-effects.md), [Houses](../builder/screens/houses.md) |
| 9 | Self-describing parametric templates; parametric furniture, windows, doors, and blinds | [Object templates](../builder/features/object-templates.md), [D26](../decisions.md#d26-self-describing-parametric-templates) |
| 16 | Floor placement and slabs, whole-house overview, stairs as objects cutting floors | [Model](../builder/model.md#floor-placement-and-slab), [stairs and floor openings](../builder/features/staircase-areas.md) |
| 17 | Built-in textured materials, yards, wall-mounted lights | [Materials and objects](../builder/features/materials-and-objects.md), [yards](../builder/features/yards.md), [lighting](../builder/features/lighting.md) |
| 19 | Roofs that cut walls, replacing roof cuts ([D28](../decisions.md#d28-roofs-cut-walls)) | [Roofs](../builder/features/roofs.md) |

Browser agent tools expose the existing editor's capabilities and documentation. External agents perform image interpretation and call the wrappers; Homeplan performs resource/API requests. This does not add built-in plan recognition to the MVP.

**HA viewer MVP (exception, [D23](../decisions.md#d23-ha-viewer-mvp)):** a read-only Home Assistant panel in `ha-viewer/` that shows a house and live entity state. It is active work alongside the builder and does not change the builder's MVP gates ([viewer MVP](../home-assistant/viewer-mvp.md)).

## Inputs to collect during Phase 1

- Counts for the representative house (floors, areas, objects, lights) and its source-asset sizes.
- Measured frame rate, edit latency, load time, memory, and export time on the reference setup. Set budgets from these measurements.
- Tuned values for the implementation conventions listed in the [decision register](../decisions.md).

**Production HA viewer (owner, 2026-11-17):** [D27](../decisions.md#d27-production-ha-viewer-and-local-snapshots) extend the active viewer exception with a [custom integration, private local snapshots, one DEV MODE for remote code/data, explicit house/panel upgrades and HA-owned configuration](../home-assistant/production-integration.md). It is implemented, with Marketplace and release-ZIP distribution, and the builder also ships as a Home Assistant app behind ingress with Supervisor discovery ([publishing](../home-assistant/publishing.md#app-packaging-and-ingress)). The builder's MVP gates and the deferred broader HA work are unchanged.
