# Home floor-plan specification

Updated: 2026-11-19. This folder holds the specification; the MVP application lives next to it (see the [project README](../README.md)).

The product is an editable, open-top 3D model of a home that later becomes a Home Assistant control surface. The **MVP is the builder alone**: a React SPA with a Node.js backend, folder/JSON storage, one building floor rendered at a time, and no ceilings. All Home Assistant work comes after the MVP's usability gate, with one exception: the read-only [HA viewer MVP](home-assistant/viewer-mvp.md) ([D23](decisions.md#d23-ha-viewer-mvp)) is active work.

**State of the spec:** every product decision is resolved or deferred ([decision register](decisions.md)). Specs describe what the app does now; work that is planned or deferred is labelled as such and is not described as existing. Phase numbers in the specs (for example "Phase 7.5") name the development step that introduced a behavior; they are history labels, not acceptance criteria.

## Start here

1. [Product overview](product/overview.md): purpose, product parts, boundaries.
2. [MVP scope and phases](product/mvp-scope.md): what Phase 1 and Phase 2 contain, the usability gate, and what is out of scope.
3. [Decision register](decisions.md): every decision with its status and basis, plus implementation conventions.
4. [Builder workflow](builder/README.md#main-workflow): draw floor shape → extrude walls → arrange areas → furnish → save/export.
5. [Glossary](product/glossary.md): guides versus RealFloor/RealWall/RealAllWalls, building floor versus floor shape, templates.

## Specification map

| Section | Documents |
| --- | --- |
| Product | [Overview](product/overview.md), [MVP scope](product/mvp-scope.md), [glossary](product/glossary.md) |
| Decisions | [Decision register](decisions.md), [specification review log](REVIEW.md) |
| Architecture | [Technical environment](architecture/technical-environment.md), [API](architecture/api.md), [frontend structure and routes](architecture/frontend-architecture.md), [state and resource clients](architecture/state-and-data.md), [rendering runtime](architecture/renderer.md), [persistence](architecture/persistence.md), [application preferences](architecture/application-preferences.md), [browser automation](architecture/browser-automation.md) |
| Interface | [Design system](design-system/README.md), [`/ds` workbench](design-system/workbench.md), [implementation examples](design-system/examples.md) |
| Builder | [Workflow and feature index](builder/README.md), [document model](builder/model.md), [object models](builder/object-models.md), [property system](builder/property-system.md), [editing lifecycle](builder/editing-lifecycle.md), [undo/redo](builder/undo-redo.md) |
| Screens | [Houses](builder/screens/houses.md), [Floor Builder](builder/screens/floor-builder.md), [Object Editor](builder/screens/object-editor.md) (Phase 2) |
| Features | [Units and grid](builder/features/units-and-grid.md), [geometry groups](builder/features/geometry-groups.md), [measurement guides](builder/features/measurement-guides.md), [arranging areas and merging walls](builder/features/shared-walls.md), [materials and objects](builder/features/materials-and-objects.md), [object templates](builder/features/object-templates.md), [house images](builder/features/house-images.md), [lighting](builder/features/lighting.md), [house environment](builder/features/house-environment.md), [stairs and floor openings](builder/features/staircase-areas.md), [roof cutouts](builder/features/roof-cutouts.md), [wall relief groups](builder/features/wall-relief-groups.md) (2026-11-16), [object groups](builder/features/object-groups.md) (2026-11-16), [ambient effects](builder/features/ambient-effects.md) (2026-11-16), [yards](builder/features/yards.md) (2026-11-18), [roofs](builder/features/roofs.md) (Phase 19.1) |
| Delivery | [Rendering and exports](delivery/rendering-and-exports.md), [deployment](delivery/deployment.md) |
| Home Assistant | **Active:** [viewer MVP](home-assistant/viewer-mvp.md) ([D23](decisions.md#d23-ha-viewer-mvp)), [bindings](home-assistant/bindings.md) ([D25](decisions.md#d25-home-assistant-bindings)), [production integration](home-assistant/production-integration.md) ([D27](decisions.md#d27-production-ha-viewer-and-local-snapshots)). Post-MVP design context: [display contract](home-assistant/README.md), [controllables](home-assistant/controllables.md), [light state](home-assistant/light-state.md), [publishing and app packaging](home-assistant/publishing.md) (the HA app packaging there is implemented; scene/image publishing is post-MVP) |

Feature specifications live in [builder/features/](builder/README.md#feature-specifications), where the builder index says what each owns.

Proposed LED strip performance work is grounded in the current renderer and keeps existing light behavior until a measured replacement passes; its design lives in [lighting](builder/features/lighting.md#planned-led-strip-performance-phase-12).

The owner-approved [browser automation interface](architecture/browser-automation.md) exposes documented editor tools through `window.homeplan` (implemented).

- **Screen documents** describe interactions.
- **Feature documents** own model and geometry behavior.
- **Architecture documents** own implementation boundaries.
- **Delivery documents** own local outputs and hosting.

Everything about Home Assistant lives under `home-assistant/`, so MVP documents do not need repeated post-MVP disclaimers. `viewer-mvp.md`, `bindings.md` and `production-integration.md` there are active viewer work; the HA viewer lives in `ha-viewer/` and reuses `shared/` and `src/renderer/`.

## Status vocabulary

| Term | Meaning |
| --- | --- |
| **Requirement** | Stated by the owner. |
| **Resolved** | A decision in the [register](decisions.md), either by the owner or by review inference from owner decisions (the register records which). |
| **Implementation convention** | A value or algorithm the implementer chooses, documents, and tunes, such as a tolerance or debounce. It is not a product decision. |
| **Post-MVP / deferred** | Kept as design context; not an MVP acceptance criterion. |
| **Illustrative** | Example JSON, code, dimensions, or names. Not a final schema or source. |

## Maintenance rules

- Keep each rule in its owning document and link to it from elsewhere.
- When a decision changes, update its register entry and the owning document together.
- Proposed source paths and API names are not evidence of existing code; inspect the source before relying on them.
- After editing, verify that local links and anchors resolve and that JSON examples parse.
