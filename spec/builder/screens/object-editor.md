# Screen 3: Object Editor

Updated: 2026-11-18.

Status: MVP Phase 2, implemented. A dedicated screen for importing models and saving them as reusable templates is an owner requirement. Templates are glTF with Homeplan metadata ([D17](../../decisions.md#d17-object-asset-format-and-template-metadata)); GLB/glTF and STL imports are accepted. Library scope and versioning are resolved in [D07](../../decisions.md#d07-template-library-and-updates); layout details are implementation choices.

## Purpose

Create and edit reusable object templates from imported GLB/glTF or STL models. Give a model the direction, physical scale, resizing and part rules, attachment, and materials it needs to participate in the house model. The editor writes Homeplan metadata into the template's glTF `extras`; it never invents a separate file format.

The Object Editor authors the template. The [Floor Builder](floor-builder.md) places instances of that template and edits their placement/allowed instance properties. A placed object is not the shared template itself.

The format and metadata are specified in [object templates](../features/object-templates.md).

## Entry and exit

Object Editor is entered from the house's template library (the house libraries section of the house properties in Floor Builder: Import model, or Edit on a house template) and from an Edit template action on a placed object.

Keep the source house/editor context so saving or leaving can return the user to their work. Routes are `/houses/:houseId/objects/new` and `/houses/:houseId/objects/:templateId` ([frontend architecture](../../architecture/frontend-architecture.md#routing-conventions)); `new` opens the Import model popup, and a successful import replaces the URL with the new template's ID. A Back action returns to the Floor Builder state the user came from.

## Layout

Reuse the editor's established layout and [design system](../../design-system/README.md):

- **Left:** vertical icon toolbox. Today it holds only Select; orientation, anchors, and resizing are edited in the properties panel. Undo/redo of the draft sit in the header.
- **Center:** 3D preview of the object, with optional reference wall/floor and mounting markers to make placement understandable.
- **Upper right:** the template's glTF node tree (parts and anchor nodes), material slots, and attachment references.
- **Lower right:** properties for the selected template part or setting.

This context is the object being authored rather than the house/floor tree. A glTF model can bring named parts; a converted STL has a single mesh node. Reference surfaces and markers are editor helpers; overhead mounting references never generate a rendered ceiling.

## Authoring workflow

1. **Import:** upload a GLB/glTF or STL file and inspect its geometry. The original upload is kept unchanged. Existing `extras.homeplan` metadata pre-fills the remaining steps.
2. **Normalize size:** glTF is already in meters. For STL, specify the source unit or one known dimension. Reuse the shared mixed-unit inputs.
3. **Normalize orientation:** confirm glTF's +Y up and +Z front; for STL, choose them. The correction is stored as the normalization root transform.
4. **Choose meaning:** set a name, semantic kind, and object contract:
   - `Areable` for non-cutting objects, including wall-mounted AC units, TVs, pictures, and sofas.
   - `Wallable` for objects fitted into wall cutouts, such as doors/windows.
   - `Staircasable` for a stair, an area object standing on the floor that cuts the floors it reaches (Phase 16.14).
5. **Define attachment and direction:** select host capabilities, the contact face or anchor node, host side, allowed flips, and default placement.
6. **Define resizing:** per axis choose `fixed`, `scale`, `slice` (with band sizes, previewed as slice lines), or `fitHostDepth`; set limits and defaults; assign `pin`, `stretch`, or `repeat` rules to parts.
7. **Define appearance:** assign/expose material slots and select suitable uploaded house textures, with mapping where supported.
8. **Preview and save:** try sizes and flips in the mounting context, validate with the glTF Validator and the metadata schema, and save a new template version.

Detailed controls and order can be refined. This is not a requirement for a separate wizard screen for every step.

## Contract-specific properties

- **Areable:** wall attachment does not create a cutout or stretch the object's body depth to the wall thickness.
- **Wallable:** define the wall opening and how the object fits the host thickness; preview its visible geometry and cutout together.
- **Staircasable:** declare the `widthMm`, `totalRiseMm` and `depthMm` size parameters on x, y and z (the cut footprint and rise); floor cuts follow the [stairs specification](../features/staircase-areas.md).
- **Light templates:** expose fixture/emitter setup, attachment defaults, supported color modes, and fallback state as described in [lighting](../features/lighting.md).

Offer only the resize modes and part rules the template declares. A width parameter alone does not keep a frame's proportions; slice bands or part rules do.

The editor edits metadata and the normalization transform only. It does not edit geometry or run custom code.

## Materials

Use the [house image library](../features/house-images.md) for texture selection (JPEG, PNG, WebP). Texture files remain in `data/<house-id>/textures/`; a converted STL has no texture coordinates, so it uses box projection.

Controllable declarations are post-MVP; see [controllables](../../home-assistant/controllables.md).

Material slots come from the glTF materials. Defining new material regions on a single mesh and UV authoring are post-MVP.

## Saving and template reuse

Scope is the active house ([D07](../../decisions.md#d07-template-library-and-updates)). Each template has its own folder under `assets/templates/<template-id>/` with the original upload, shared geometry, and one `vN.gltf` file per version ([object templates](../features/object-templates.md#template-versions-are-gltf-files)).

Saved templates become available to the Floor Builder's appropriate placement workflow. Each placement receives a new stable instance ID and references the template/version. Suggested default placement is applied on insertion rather than overwriting saved instance placement on every load.

Saving creates a new template version; placed instances keep their pinned version until the user explicitly adopts the new one ([D07](../../decisions.md#d07-template-library-and-updates)).

## Deferred beyond MVP

- Cross-house template libraries and import/export packaging ([D07](../../decisions.md#d07-template-library-and-updates)).
- Source replacement, geometry editing, UV/material-region authoring, non-rectangular openings, and animations.
- Controllable declarations ([controllables](../../home-assistant/controllables.md)).

## Shared editing contract

Save timing, previews, cancellation, undo/redo, and conflict feedback follow the [editing lifecycle](../editing-lifecycle.md). The unsaved template-metadata draft has its own isolated history ([undo/redo](../undo-redo.md#uploads-and-other-file-operations)). Source/derived-data ownership is described in the [document model](../model.md#source-and-derived-data-boundary).

## Verification scenarios

- Import a GLB, confirm its orientation, define slice bands, and save a template version that opens in any glTF viewer.
- Import an STL, set its unit and orientation, and save it in the same template format.
- Configure an AC as wall-mounted `Areable` without creating a wall opening.
- Configure an opening-fitting `Wallable` and preview matching cutout/depth behavior.
- A pinned part (for example a mullion) keeps its size while the sliced axis stretches in the preview.
- Save a template and place independent instances from it in the Floor Builder.
- Source model, template versions, textures, and instance references survive save/reload in the house folder.
