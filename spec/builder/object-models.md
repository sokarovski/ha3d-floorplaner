# Object models and property metadata

Updated: 2026-11-20 (the material chooser).

Status: **resolved; approved by the owner** ([D18](../decisions.md#d18-property-schemas-and-the-property-panel)). This page collects every object type's properties from the feature specifications and adds the property metadata the [property system](property-system.md) needs. Each table becomes that type's JSON Schema, and the [editor list](#editors-needed) is the property-editor specification. Limits and defaults not attributed to an owner decision are implementation conventions that may be tuned.

Implemented: the schemas live in `shared/domain/schemas/` (house schema version 4); property names below match them exactly. Where each entity sits in `house.json`, its ID prefix, and the schema versions are in the [model](model.md#document-tree-ids-and-the-entity-index).

## How to read the tables

- **Model** columns describe the data: name, value type, unit and limits, default.
- **Metadata** columns describe the panel:
  - **Edit:**
    - `panel`: editable in the property panel.
    - `viewport`: edited with handles or tools; the panel shows it read-only or not at all.
    - `derived`: computed, never stored.
    - `hidden`: stored but not shown.
  - **Editor:** which [property editor](#editors-needed) edits it.
- **Groups** under each heading are the panel groups the type declares, from the shared [group catalog](property-system.md#property-groups), in catalog order.
- IDs, `schemaVersion`, and `revision` exist on every stored document or entity and are `hidden`; they are not repeated per table. Child lists (`floors`, `areas`, `walls`, `objects`, `shapes`, …) are `hidden` in the panel and edited through the tree and tools.
- Lengths are millimeters, angles degrees.

## Shared value types

Reused by several object types; each becomes one shared sub-schema.

| Value type | Shape | Editor |
| --- | --- | --- |
| `Length` | number, mm, fractions allowed | `length` |
| `Angle` | number, degrees | `angle` |
| `Vector2Length` | `{ x: Length, y: Length }` in the parent's plane | `vector2Length` |
| `ColorRgb` | `[r, g, b]`, sRGB 0–255 integers | `color` |
| `LightColor` | `{ mode: fixedWhite \| colorTemperature \| rgb, kelvin?, rgb? }`, one active mode | `select` + `slider` + `color` |
| `SurfaceMaterial` | A glTF 2.0 material stored on the surface (see [Surface material](#surface-material)) | `material` |
| `TemplateRef` | `{ templateId, templateVersion }` (a light's `fixture`); template instances store the same two fields flat, `templateId` hidden | `templateVersion` |
| `Flip` | `{ x: boolean, z: boolean }`, titled Left/right and Front/back; only axes the template allows | `toggle` ×2 |
| `Ref<Type>` | stable ID of another object | `reference` |
| `Hidden` | optional boolean, titled Hidden, General group, order 90 (Phase 7.5). On area, wall, wall feature, area object, object group, carpet, and light; absent = shown. Saved-Hidden things are not drawn unless the builder's Show hidden is on, never in the HA viewer or exports ([floor builder](screens/floor-builder.md#hide-and-hidden)). A wall now lists the General group for it | `toggle` |

## Phase 1 types

### House (`house.json`)

Groups: General, Environment, Appearance.

| Property | Value type | Unit / limits | Default | Edit | Editor |
| --- | --- | --- | --- | --- | --- |
| `name` | string | 1–120 chars, trimmed | "New house" | panel | `text` |
| `units` | enum | `mm`, `cm`, `m`, `in`, `ft` | `mm` | panel | `select` |
| `capMaterial` | `SurfaceMaterial` | — | plain white | panel | `material` |
| `defaultWallHeightMm` | `Length`, optional | 100–10 000 | absent = 2400 | panel | `length` |
| `environment.location` | `{ latitudeDeg, longitudeDeg, timeZone }` (legacy optional `countryCode`, `city` kept, never written) | lat −90…90, lon −180…180, IANA zone | London | panel | `location` |
| `environment.northRotationDeg` | `Angle` | 0–360, clockwise from plan up | 0 | panel + viewport compass | `angle` |
| `environment.sun.timeMode` | enum | `fixed`, `current` | `fixed` | panel | `select` |
| `environment.sun.fixedLocalDateTime` | local date-time | ISO without offset | `2020-06-01T12:00:00` | panel, when `fixed` | `dateTime` |
| `materialPresets` | list of presets | — | [] | house properties (rename/delete); hidden in the panel | — |
| `floors` | list of building floors | ≥ 1 | one `Etage1` | tree | — |
| Images | server-owned index, not in `house.json` ([D14](../decisions.md#d14-project-management-and-names)) | — | — | Images panel | — |
| Sun azimuth / elevation | `Angle` | — | — | derived | `readOnly` |

### Surface material

Resolved by [D19](../decisions.md#d19-materials). Stored inline on every material slot in the glTF 2.0 material format. There is no separate material object to edit.

| Property | Value type | Unit / limits | Default | Edit | Editor |
| --- | --- | --- | --- | --- | --- |
| `pbrMetallicRoughness.baseColorTexture` | `Ref<Image>` or none | a house image (JPEG, PNG, WebP) | none | panel | `image` |
| `pbrMetallicRoughness.baseColorFactor` | color | tint over the image, or the flat color without one | white | panel | `color` |
| `pbrMetallicRoughness.roughnessFactor` | number 0–1 | shown as **Shininess** = 1 − roughness | 0.8 (shininess 0.2) | panel | `slider` |
| `pbrMetallicRoughness.metallicFactor` | number 0–1 | — | 0 | panel | `slider` |
| `extras.homeplan.tileSizeMm` | `Vector2Length` | physical size of one image repeat | 1000 × 1000 | panel | `vector2Length` |
| `extras.homeplan.rotationDeg` | `Angle` | texture rotation on the surface | 0 | panel | `angle` |
| `extras.homeplan.offsetMm` | `Vector2Length` | texture shift on the surface | 0, 0 | panel | `vector2Length` |
| Preset | **More…** opens the material chooser: apply a preset or a material used in the house (copies its values), or **Save current as preset** | — | — | panel | `material` (chooser) |

### Material preset (house list)

| Property | Value type | Unit / limits | Default | Edit | Editor |
| --- | --- | --- | --- | --- | --- |
| `name` | string | 1–120 chars | from the Save as preset prompt | house properties | `text` |
| `material` | `SurfaceMaterial` | — | copied from the surface | saved again from a surface | — |

Built-in presets are read-only. Deleting a preset never changes surfaces.

### Building floor (entry in `house.json` `floors`)

Groups: General, Placement, Slab.

| Property | Value type | Unit / limits | Default | Edit | Editor |
| --- | --- | --- | --- | --- | --- |
| `name` | string | 1–64 chars, unique in the house case-insensitively ([D14](../decisions.md#d14-project-management-and-names)) | next free `EtageN` | panel | `text` |
| `positionMm` | `{ x, y }` (optional) | mm, plan offset in the house | `{ 0, 0 }` | panel (Placement) | `vector2Length` |
| `elevationMm` | number (optional) | mm, ±100 000 | 0; Add floor suggests one above the top floor | panel (Placement) | `length` |
| `slabThicknessMm` | number (optional) | mm, 0–1000, 0 = no slab | 200 | panel (Slab) | `length` |
| `slabMaterial` | `SurfaceMaterial` (optional) | — | built-in Concrete | panel (Slab) | `material` |
| `areas`, `lightGroups`, `guides` | lists | — | [] | tree (Add menus) | — |
| `roofs` | list (optional, Phase 19.1; one roof on the top floor) | — | absent | tree (Add roof) | — |

The four Phase 16 fields are optional (no schema version change) and filled with their defaults when a house is read; see [floor placement and slab](model.md#floor-placement-and-slab).

### Area

Groups: General, Placement, Appearance (a yard's Fence); then the nested **Flooring** group (the floor's material). The required `kind` (room or staircase) and `staircase` were removed in house schema version 5 (Phase 16.14); the optional `kind: "yard"` of Phase 17.2 marks a [yard](features/yards.md), and the panel titles it Yard.

| Property | Value type | Unit / limits | Default | Edit | Editor |
| --- | --- | --- | --- | --- | --- |
| `name` | string | 1–120 chars, need not be unique | `Area N` | panel | `text` |
| `positionMm` | `Vector2Length` | relative to the floor | view center | panel + viewport | `vector2Length` |
| `rotationDeg` | `Angle` | about the vertical axis; Rotate grips lock at quarter turns ([rotating rooms](screens/floor-builder.md#rotating-rooms)) | 0 | panel + viewport | `angle` |
| Floor area | number, m² | — | — | derived | `readOnly` |
| `floor`, `walls`, `objects`, `lights` | children | — | — | tree | — |
| `objectGroups` | list of [object groups](#object-group), optional | — | absent | tree, Group / Ungroup | — |
| `kind` | `"yard"`, optional (Phase 17.2, [yards](features/yards.md)) | — | absent (a room) | set by Add yard only | hidden |
| `fence` | enum `picket`, `panel`, `hedge`, `slatted`, `trellis`, `wire`, optional; yards only | — | `picket` | panel (Appearance, **Fence**) | `select` |

### Floor shape (the area's Floor row)

Groups: Appearance (the material is titled **Flooring**).

| Property | Value type | Unit / limits | Default | Edit | Editor |
| --- | --- | --- | --- | --- | --- |
| `material` | `SurfaceMaterial` | — | built-in "default flooring" preset | panel | `material` |
| `shapes` | list of shapes | ≥ 1 for a valid floor | [] | Room Editor tools | — |
| `carpets` | children (`Floorable`) | — | [] | tree (Floor row Add menu) | — |

### Shapes (in Room Editor and carpets)

Groups: Placement, Size. The same shape schemas serve the area floor, carpets, and wall features; a feature's shapes are in the wall-face frame.

| Shape | Property | Value type | Unit / limits | Edit | Editor |
| --- | --- | --- | --- | --- | --- |
| all | `positionMm` | `Vector2Length` | relative to the shape group | panel + viewport | `vector2Length` |
| all except circle | `rotationDeg` | `Angle` | in-plane | panel + viewport | `angle` |
| Rectangle | `widthMm`, `heightMm` | `Length` | > 0, ≤ 200 000; shown as one "Width × Depth" row (inline labels W, D) | panel + viewport | `length` |
| Circle | `radiusMm` | `Length` | > 0, ≤ 100 000; its `positionMm` is titled Center | panel + viewport | `length` |
| Polygon | `vertices` | list of `{ id, x, y }` | ≥ 3, not self-intersecting | viewport | — |
| Polygon | Vertex count, perimeter | number, `Length` | — | derived | `readOnly` |

Triangles are polygons drawn with the pencil; there is no separate triangle shape.

### Wall

Groups: Size (height, Rise to roof, thickness), Placement (alignment), Appearance (the nested **Materials** group with Interior and Exterior).

**Rise to roof** (Phase 19.5, owner 2026-11-19: "a per-wall switch to opt out of rising to the roof"): under a roof in Cuts walls mode with Walls rise on, a wall with this off keeps its own height instead of rising to the underside; the roof still clips it where it is lower. With the roof's Walls rise off it changes nothing. Optional, so older houses stay valid without a schema version change; the HA integration needs a reinstall for its `schemas.json` before a house that sets it is published ([roofs](features/roofs.md#the-roof-cuts-walls)).

| Property | Value type | Unit / limits | Default | Edit | Editor |
| --- | --- | --- | --- | --- | --- |
| `heightMm` | `Length` | 1–20 000 | house default wall height (2400 when unset) | panel + viewport | `length` |
| `thicknessMm` | `Length` | 1–2000 | 200 | panel | `length` |
| `riseToRoof` (Phase 19.5, optional) | boolean | — | absent = on: the wall follows its floor roof's Walls rise | panel ("Rise to roof", Size group) | `toggle` |
| `alignment` | enum | `outside`, `inside`, `center` | `outside` | panel | `select` |
| `materials.interior` | `SurfaceMaterial` | — | built-in "default wall paint" preset | panel | `material` |
| `materials.exterior` | `SurfaceMaterial` | — | built-in "default wall paint" preset | panel | `material` |
| `spanMm.start`, `spanMm.end` | `{ anchor: start \| end, offsetMm: Length }` | each end measured from one corner of the source edge; corners at offset 0 follow the floor (Phase 3) | both ends at their corners | viewport only (end lines, with typed distances) | — |
| Length | `Length` | — | — | derived | `readOnly` |
| Needs repair | boolean + reason | — | — | derived | `readOnly` (warning) |
| `sourceEdge` | `{ shapeId, edge }` | — | — | hidden | — |
| `objects` | children (`Wallable`) | — | [] | tree | — |
| `reliefs` | children ([wall features](#wall-feature-relief-group)), optional | — | absent | tree | — |

Trimming and extending stay in the viewport; the panel shows the wall's length read-only.

### Wall feature (relief group)

Phase 5.0, [D21](../decisions.md#d21-wall-reliefs), extended by [wall relief groups](features/wall-relief-groups.md) (schema version 4). Stored as `wall.reliefs`, called a feature in the UI.

Groups: General, Placement (face), Size (depth), Appearance.

| Property | Value type | Unit / limits | Default | Edit | Editor |
| --- | --- | --- | --- | --- | --- |
| `name` | string | 1–120 chars | "Feature" + next free number | panel | `text` |
| `face` | enum | `interior`, `exterior` | `interior` | panel | `select` |
| `depthMm` | `Length` | −2000 to 2000; positive sticks out (box), negative goes in (niche), 0 flat (colour only, not extruded) | 0 | panel | `length` |
| `material` | `SurfaceMaterial` | — | a copy of the host face's material | panel | `material` |
| `shapes` | rectangle, circle, polygon (same schemas as floor and carpet shapes) | in the face frame: x along the wall from its span start, y up from the floor; at least one | from Add → Feature: one 600 × 600 mm rectangle (smaller on a short or low wall), centred along the wall, its bottom 900 mm up (centred in height on walls under 1500 mm); from a drawing tool: the drawn shape | shape tools | — |

The shapes combine by union into one outline; the feature has one depth and one material. A feature belongs to its wall: trims and extends keep it in place along the wall, a split keeps it whole on the half that holds its start, and deleting or filling the wall removes it (Undo restores). It is added from the wall row's Add menu (**Feature**) or by drawing a shape on the wall face with no feature open, edited by double-clicking it on the face (the shared 2D shape editor), and selected from the tree or by clicking one of its faces in the Room Editor. Add → Feature opens the new feature for editing. Houses saved before version 4 hold one rectangle per relief; they migrate to a feature with that rectangle as its single shape.

### Door or window (`Wallable` instance)

Groups: General, Placement, Template, Appearance.

| Property | Value type | Unit / limits | Default | Edit | Editor |
| --- | --- | --- | --- | --- | --- |
| `name` | string | 1–120 chars, need not be unique | template label + next free number | panel | `text` |
| `templateId`, `templateVersion` | `TemplateRef` fields, flat | pinned version; `templateId` hidden | latest on insert | panel ("Update to vN") | `templateVersion` |
| `placement.distanceAlongWallMm` | `Length` | wall start to the opening's centre; clamped within the wall and between openings | template default | panel + viewport | `length` |
| `placement.bottomMm` | `Length` | ≥ 0, fits the wall height | template default | panel + viewport | `length` |
| `parameters.widthMm`, `parameters.heightMm` | `Length` | from template resize limits | template default | panel | `length` |
| `parameters.depthMm` | `Length` | only if the template's depth is not `fitHostDepth` | template default | panel | `length` |
| other `parameters.*` | from template `properties` | — | — | panel | per template |
| `flip` | `Flip` | allowed axes only | `{ x: false, z: false }` | panel | `toggle` |
| `materialOverrides.<slot>` | `SurfaceMaterial`, or `{ preset }` (a bundled preset, Phase 9.1) | choosable template slots | `{}` (template material) | panel (choosable slots) | `materialChoice` |
| Fits wall | boolean + reason | — | — | derived | `readOnly` (warning) |

### Object (`Areable` instance: ornaments, appliances, stairs, floor openings)

Groups: General, Placement, Staircase (stairs only), Template, Appearance. Stairs (`Staircasable` templates) and floor openings are objects too ([stairs and floor openings](features/staircase-areas.md), Phase 16.14).

| Property | Value type | Unit / limits | Default | Edit | Editor |
| --- | --- | --- | --- | --- | --- |
| `name` | string | 1–120 chars, need not be unique | template label + next free number | panel | `text` |
| `templateId`, `templateVersion` | `TemplateRef` fields, flat | `templateId` hidden | latest on insert | panel | `templateVersion` |
| `attachment.host` | enum | template's `hosts`: `floor`, `wall`, `overhead` | template default | panel | `select` |
| `attachment.wallId` | `Ref<Wall>` | when host is `wall` | picked wall | panel + viewport | `reference` |
| `attachment.hostSide` | enum | `interior`, `exterior` | `interior` | panel, when host is `wall` | `select` |
| `positionMm` | `Vector2Length` | area-relative (along-wall and height when wall-mounted) | template default | panel + viewport | `vector2Length` |
| `elevationMm` | `Length` | above the floor, or the offset below the overhead reference | template default | panel + viewport | `length` |
| `rotationDeg` | `Angle` | about the vertical axis | 0 | panel + viewport | `angle` |
| `parameters.*` | from template | template limits | template default | panel | per template |
| `flip` | `Flip` | allowed axes only | `{ x: false, z: false }` | panel | `toggle` |
| `materialOverrides.<slot>` | `SurfaceMaterial`, or `{ preset }` (a bundled preset, Phase 9.1) | choosable template slots | `{}` (template material) | panel (choosable slots) | `materialChoice` |
| `floorCut` | enum, optional | `stair` (a `Staircasable` template) or `opening` (a template with `floorCut` metadata); set on insertion | absent | hidden (read-only) | — |
| `floorCutShape` | enum, optional | `rectangle`, `ellipse`; a floor opening's outline from its template | absent (`rectangle`) | hidden (read-only) | — |
| `cutFloorAbove` | boolean, optional | **Cut floor above**: floors the stair's span crosses are cut; while `floorCut` is `stair` | `true` | panel (Staircase) | `toggle` |
| `cutFloorBelow` | boolean, optional | **Cut floor below**: the stair's own floor is cut; while `floorCut` is `stair` | `false` | panel (Staircase) | `toggle` |
| `effects` | `AmbientEffect[]`, optional | at most 8; each an entity of its own, under the object in the tree | template's default effects | tree + panel (per effect) | hidden here |

**Ambient effect** (`effects[]` item, [D24](../decisions.md#d24-ambient-effects), [ambient effects](features/ambient-effects.md)). Groups: General, Placement, Appearance.

| Property | Value type | Unit / limits | Default | Edit | Editor |
| --- | --- | --- | --- | --- | --- |
| `id` | ID (`fx_`) | — | new | — | hidden |
| `kind` | enum | `swirl`, `vapour` | `swirl` | panel | `segmented` |
| `enabled` | boolean | Phase 8 binds it to a Home Assistant state | `true` | panel | `toggle` |
| `direction` | enum | `up`, `forward` (along the object's front) | `up` | panel | `segmented` |
| `offsetMm` | `{ x, y, h }` lengths | from the middle of the model box's top (up) or front (forward); x right, y forward, h up | `{ 0, 0, 100 }` | panel | `length` × 3 |
| `color` | sRGB 0–255 | — | red | panel | `color` |
| `sizeMm` | `Length` | 100–3000 | 600 | panel | `length` |

Every placed object, door, window, and light has its own editable name, shown in the tree; it starts as the template label plus the next free number ("Pendant Light 2").

### Object group

Phase 5.17, [object groups](features/object-groups.md). Stored in `area.objectGroups` (optional; no schema version change). Groups: General.

| Property | Value type | Unit / limits | Default | Edit | Editor |
| --- | --- | --- | --- | --- | --- |
| `name` | string | 1–120 chars | `Group N` | panel | `text` |
| `memberIds` | list of `Ref<Object>` | ≥ 2 unique objects of this area, floor or overhead hosted; an object is in at most one group | the grouped selection | panel, Group / Ungroup | `reference` (multi) |

A group with fewer than two members is removed automatically. Wall-hosted objects, openings, lights, and carpets cannot be grouped; groups do not nest. Grouping changes no geometry: members keep their own placement.

### Carpet (`Floorable`, child of the area's floor)

A flat surface that attaches only to its area's floor; position and rotation are in the floor plane, and its shapes are in the carpet's own frame. Groups: General, Placement, Appearance.

| Property | Value type | Unit / limits | Default | Edit | Editor |
| --- | --- | --- | --- | --- | --- |
| `name` | string | 1–120 chars | `Carpet N` | panel | `text` |
| `positionMm` | `Vector2Length` | area-relative | the area's origin | panel + viewport | `vector2Length` |
| `rotationDeg` | `Angle` | in-plane | 0 | panel + viewport | `angle` |
| `material` | `SurfaceMaterial` | — | a plain dark red (base colour 0.45, 0.2, 0.18; roughness 0.95) | panel | `material` |
| `shapes` | list of rectangle, circle, polygon | ≥ 1 (the last piece cannot be deleted) | one 2000 × 1400 mm rectangle | Carpet Editor shape tools; box handles scale all pieces | — |
| Stack order | array order | later carpets draw over earlier ones | last | Bring forward / Send backward in the carpet's actions menu (Phase 7.3) | — |

### Light

Groups: General (name, fixture, Show fixture), Emitter (type, length, width, spot), Placement (mount, wall, wall side, position, elevation, heading), Light (lamp type, lamp power, capabilities, defaults).

| Property | Value type | Unit / limits | Default | Edit | Editor |
| --- | --- | --- | --- | --- | --- |
| `name` | string | 1–120 chars, need not be unique | fixture label + number, or `Light N` | panel | `text` |
| `fixture` | `TemplateRef` or none | none = invisible source | none | panel | `templateVersion` |
| `fixtureVisible` | boolean | independent of `enabled`; titled Show fixture | true | panel | `toggle` |
| `geometry.type` | enum | `point` (all directions), `spot` (beam), `linear` (strip) | `point` | panel | `select` |
| `geometry.lengthMm` | `Length` | > 0, when `linear` | 1000 | panel + viewport | `length` |
| `geometry.widthMm` | `Length` | > 0, when `linear` | 12 | panel | `length` |
| `mount` | enum, optional | `free` (absent) or `wall`: mounted on a face of one of its area's walls (Phase 17.3, [wall-mounted lights](features/lighting.md#wall-mounted-lights-phase-173)); Wall picks the nearest wall and snaps the light onto it | absent (a wall-only fixture sets `wall`) | panel | `segmented` |
| `wallId` | `Ref<Wall>`, optional | a wall of the light's area; shown when Mount = Wall | the nearest wall | panel | `reference` |
| `wallSide` | enum, optional | `interior` (into the room) or `exterior` (outside it); shown when Mount = Wall | the side the light is on, or the fixture's `defaultHostSide` | panel | `segmented` |
| `positionMm` | `Vector2Length` | area-relative; a wall-mounted light is projected onto its face | added from the tree: the room's centre, following the pointer until a click | panel + viewport | `vector2Length` |
| `elevationMm` | `Length` | above the floor | 100 mm under the room's highest wall (or the house default height) | panel + viewport (Raise) | `length` |
| `rotationDeg` | `Angle` | heading about the vertical axis, for `spot` and `linear`; titled Heading | 0 | panel + viewport (Rotate) | `angle` |
| `spot.tiltDeg` | `Angle` | 0–180; 0 = straight down, 90 = horizontal; `spot` only; the Aim handle sets up to 80 | 0 | panel + viewport | `angle` |
| `spot.beamAngleDeg` | `Angle` | full cone angle 1–160°; `spot` only | 40 | panel | `slider` |
| `spot.softEdge` | number 0–1 | 0 = hard edge, 1 = fully soft; `spot` only | 0.3 | panel | `slider` |
| `lampType` | enum, optional | `tungsten`, `halogen`, `ledWarm`, `ledNeutral`, `ledCool`, `fluorescent`, `neon`; absent = untyped (drawn as before Phase 8.9). Choosing one sets the type's white and snaps the output to its nearest preset ([lamp types](features/lighting.md#lamp-types)) | absent | panel | `select` |
| `lampWatts` | number, W, optional | > 0, ≤ 5000; the real lamp's power; choosing a preset sets `defaults.outputLumens`, editing the output keeps it in step | absent (set with the type) | panel, disabled until a type is chosen | `lampPower` |
| `renderCapabilities.colorModes` | set of enum | `fixedWhite`, `colorTemperature`, `rgb` | from fixture, else all | panel (invisible sources only) | `multiSelect` |
| `defaults.enabled` | boolean | — | true | panel | `toggle` |
| `defaults.brightness` | number | 0–1 | 1 | panel | `slider` |
| `defaults.outputLumens` | number, lm | > 0, ≤ 200 000 | fixture default, else 800 | panel | `number` |
| `defaults.color.mode` | enum | within `colorModes` | first mode | panel | `select` |
| `defaults.color.kelvin` | number, K | template limits, else 1500–9000, step 50 | 3000 | panel, when `colorTemperature` | `slider` |
| `defaults.color.rgb` | `ColorRgb` | 0–255 | `[255, 255, 255]` | panel, when `rgb` | `color` |
| Light-group membership | not stored on the light; the group's `memberIds` | — | — | the light group's Members field (not yet shown on the light) | `reference` (multi) |

Spot lights aim by heading and tilt; beam angle and soft edge map to glTF `KHR_lights_punctual` spot cones (outer and inner cone angle) and the preview `SpotLight` angle and penumbra.

### Light group

Stored in `floor.lightGroups`; a light group is not an [object group](#object-group). Groups: General, plus a **Set on N members** section.

| Property | Value type | Unit / limits | Default | Edit | Editor |
| --- | --- | --- | --- | --- | --- |
| `name` | string | 1–120 chars | `Group N` | panel | `text` |
| `memberIds` | list of `Ref<Light>` | unique lights on this floor | the selected lights when added | panel + viewport selection | `reference` (multi) |
| Set on members: enabled, brightness, color | the Light properties of the same name | — | Mixed when members differ | panel (bulk edit, not stored on the group) | as on Light |

### Guide

Stored in `floor.guides` ([D16](../decisions.md#d16-interaction-defaults-and-support-limits)). Groups: General.

| Property | Value type | Unit / limits | Default | Edit | Editor |
| --- | --- | --- | --- | --- | --- |
| `kind` | enum | `line`, `point` | from the tape mode | readOnly | `readOnly` |
| `visible` | boolean | — | true | panel | `toggle` |
| `aMm`, `bMm` | `Vector2Length`, floor coordinates | a line passes through both; a point marks `bMm` | from the tape | hidden (viewport, tape tool) | — |

### Application preferences (settings form)

| Property | Value type | Unit / limits | Default | Edit | Editor |
| --- | --- | --- | --- | --- | --- |
| `appearance.theme` | enum | `auto`, `light`, `dark` | `auto` | panel | `segmented` (with icons) |
| `appearance.colorScheme` | enum | `blue`, `graphite`, `green`, `custom` (Phase 5.5) | `blue` | panel | `segmented` |
| `appearance.customColors` | five `ColorRgb`: `neutral`, `accent`, `danger`, `warning`, `success` | when `colorScheme` is `custom` | absent | panel | `color` |
| `editor.showGroundGrid` | boolean | — | true | panel | `toggle` |
| `editor.navigation` | enum | `trackpad`, `mouse` | `trackpad` | panel | `segmented` |
| `homeAssistant` | HA viewer setup, light bindings, room-cards dashboard | — | empty | hidden (set up from the [HA viewer](../home-assistant/viewer-mvp.md), D23) | — |

Preferences are installation-global ([D12](../decisions.md#d12-user-identity-and-access)) and saved instantly (Phase 5.9). Magnetic is a session toggle in the toolbox, not a stored preference ([D16](../decisions.md#d16-interaction-defaults-and-support-limits)).

## Phase 2 types

### Roof (Phase 19)

Stored in `floor.roofs` ([roofs](features/roofs.md)). Groups: General, Materials, Ribs. Its points, outline and break lines are edited in the roof's editing level (a selected point shows its Height); the Phase 2 roof cut (`floor.roofCuts`) was replaced by it in house schema version 6.

| Property | Value type | Unit / limits | Default | Edit | Editor |
| --- | --- | --- | --- | --- | --- |
| `name` | string | — | `Roof` | panel | `text` |
| `design` | enum | `closed`, `open` | `closed` | panel | segmented |
| `cutsWalls` | boolean | Cuts walls: the underside limits the floor's walls (19.2) | true | panel | `toggle` |
| `wallsRise` | boolean | Walls rise: walls under the roof extend to the underside (19.2); shown while `cutsWalls` | true (false for a roof migrated from roof cuts) | panel | `toggle` |
| `eaveHeightMm` | `Length` | 0–30 000 | the floor's tallest wall | panel + Move | `length` |
| `thicknessMm` | `Length` | 10–1000 | 200 | panel | `length` |
| `topMaterial`, `bottomMaterial`, `sideMaterial` | `SurfaceMaterial` | side: closed only | terracotta, ash planks, white | panel | `material` |
| `ribHeightMm`, `ribWidthMm`, `ribSpacingMm`, `ribMaterial` | `Length`, enum | open only | 160 × 60, 600, wood | panel | `length`, segmented |
| `points[]` (`x`, `y`, `heightMm`), `outline[]`, `lines[]` | lists | ≤ 400 points; heights ≥ 0 above the eave | Add roof's rectangle | roof level | hidden (Height per point) |

### Staircase (former instance in a staircase area)

Removed in house schema version 5 (Phase 16.14): a stair is an [object](#object-areable-instance-ornaments-appliances-stairs-floor-openings) with a `Staircasable` template; staircase areas are migrated ([migration](features/staircase-areas.md#migration-of-staircase-areas)).

### Template metadata (Object Editor)

The Object Editor edits the [Homeplan metadata](features/object-templates.md#homeplan-metadata) itself through the same panel:
- **Scene metadata:** `kind`, `label`, `contract`, `attachment.*`, per-axis `resize.*`, `flip`, `opening`, `materialSlots`.
- **Part rules:** `pin`, `stretch`, `repeat` on the selected node.

It reuses `text`, `select`, `toggle`, `length`, `number`, and `multiSelect`, plus a `nodeRef` editor for picking glTF nodes (anchors, slot materials).

## Editors needed

Derived from the tables above:

| Editor | Used by | Kind |
| --- | --- | --- |
| `text` | every `name` | generic |
| `number` | lumens, step count | generic |
| `length` | every dimension, position part, elevation, roof points | generic |
| `angle` | rotations, north, roof direction | generic |
| `vector2Length` | positions | generic |
| `select` | dropdowns: units, kinds, color mode, staircase direction and run, more than three choices | generic |
| `segmented` | choices with 2–3 options: alignment, face, host, wall side, layout, theme, navigation | generic |
| `multiSelect` | light color capabilities, template hosts | generic |
| `toggle` | enabled, visible, active, flips, show fixture, grid (a Yes / No segmented control) | generic |
| `slider` | brightness, Kelvin, beam angle, soft edge, shininess, metallic | generic |
| `color` | RGB light color, custom scheme colours | generic |
| `dateTime` | fixed sun date and time | generic |
| `file` | upload and import popups | generic |
| `readOnly` | derived values and warnings | generic |
| `reference` | attachment wall, light-group and object-group members | domain (pick from the tree or viewport) |
| `material` | every `SurfaceMaterial`: the fields above as one group, the **More…** material chooser (apply, Save current as preset, rename or delete house presets) | domain |
| `image` | a surface's texture: pick from the house image library or upload | domain |
| `templateVersion` | every `TemplateRef` | domain |
| `location` | house location (latitude/longitude, with time zone) | domain |
| `nodeRef` | Object Editor only (Phase 2) | domain |
| `lampPower` | a light's lamp power: the presets of its lamp type as "watts · lumens" (Phase 8.9) | domain (reads the owner's `lampType`) |
| `materialChoice` | a choosable template material slot: the slot's material and bundled presets as swatches, then own colour / own texture when allowed (Phase 9.1) | domain (choices from `x-homeplan.materialChoice`) |

This list is the same as the [property system](property-system.md#property-editors) registry. The `select` editor has a searchable variant for long lists such as time zones.

## Decided gaps

G1 (materials, [D19](../decisions.md#d19-materials)), G2 (triangles are pencil polygons), G3 (wall span stays in the viewport), G4 (instances have their own names), and G5 (spot lights are in MVP) were decided by the owner. No gaps remain.
