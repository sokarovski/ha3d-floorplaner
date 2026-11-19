# Floor data model and geometry rendering

Updated: 2026-11-16.

Status: the storage hierarchy, Floor/Area hierarchy, local geometry groups/transforms, 1 mm internal unit, floor shape and wall guides with derived RealFloor/RealWall, and local TypeScript renderers are resolved ([D03](../decisions.md#d03-coordinates-units-and-floor-local-geometry), [D04](../decisions.md#d04-footprints-walls-and-stable-boundaries)). Implemented: the `house.json` schema is built (house schema version 6) in TypeBox in `shared/domain/schemas/`; field names on this page match it. Per-type properties are listed in [object models](object-models.md).

See the [Floor Builder screen](screens/floor-builder.md) for the editing interactions that author these models.

Location, north orientation, and sunlight time are shared house-level inputs inherited by all floors, not duplicated floor properties. See [house environment](features/house-environment.md) for the recommended `house.json` storage and defaults.

## Storage boundary

All of a house's floors are stored in its single `house.json`, in a `floors` list; each floor has a stable ID and a `name` property. The [persistence specification](../architecture/persistence.md) owns the storage tree, naming, revisions, and save/recovery rules.

`house.json` is the single authoring source for the house: metadata, units, environment, cap material, material presets, and floors. It references assets by ID only.

A house collects two reusable asset libraries, both server-owned and shared by every floor and area of that house:

| Library | Contents | Storage | Metadata |
| --- | --- | --- | --- |
| [Images](features/house-images.md) | JPEG/PNG/WebP textures | `textures/<image-id>.*` | `textures/images.json` |
| [Object templates](features/object-templates.md) | Ornaments, appliances, doors, windows, fixtures, staircases as glTF (imported GLB/glTF or converted STL) | `assets/templates/<template-id>/` | the template's own `vN.gltf` files |

Placing an object references a template by ID and version, just as a surface references an image by ID. Built-in templates ship with the application in Phase 1; importing GLB/glTF/STL into the house library is Phase 2 ([D07](../decisions.md#d07-template-library-and-updates), [D17](../decisions.md#d17-object-asset-format-and-template-metadata)).

## Abstract model hierarchy

- **Floor:** one entry in the house's `floors` list, with `id` and `name`. Its primary collection is Areas.
- **Area:** one named entity such as Living Room, second bedroom, Hall, or Garden. Stairs are objects inside them (Phase 16.14). An area is a room unless its optional `kind` is `"yard"` (Phase 17.2, [yards](features/yards.md)): set only by Add yard on the ground floor, it is outdoors (Lawn flooring, no slab, no ceiling), its walls are drawn as fences of its `fence` style, doors on them are gates, and its carpets are pathways.
- **Floor shape (guide):** a local group of editable source shapes forming the area's basic contour; its union can be a compound region. Every area generates solid flooring; stairs and floor openings cut it (below).
- **Walls (guides):** independently editable segments extruded from straight floor-shape edges, each anchored to a source edge, with alignment (inside/outside/center), height, thickness, and separate side materials.
- **RealFloor / RealWall (derived):** the rendered floor and wall geometry calculated from the guides, including floor enlargement under walls, shared-wall union, openings, and cuts. Never persisted as editable data. See [geometry groups](features/geometry-groups.md#authored-guides-and-derived-geometry).
- **Wall children (`Wallable`):** glTF-template doors/windows hosted by a wall, fitted to its depth and supplying wall cutouts ([object templates](features/object-templates.md)).
- **Area objects (`Areable`):** non-cutting objects such as a TV, picture, sofa, or air conditioner. Wall-mounted instances remain area-owned and reference an attachment wall without cutting it or inheriting its thickness as body depth.
- **Stairs and floor openings (Phase 16.14):** a stair is an area object with a `Staircasable` template and the switches Cut floor above (on) and Cut floor below (off); a floor opening is an area object whose template declares `floorCut`. A derived step cuts every floor they reach out of its RealFloor and slab. See [stairs and floor openings](features/staircase-areas.md).
- **Carpets (`Floorable`):** flat surfaces hosted by the area's floor, the floor counterpart of `Wallable`: each has its own position, rotation, and material, and one or more shapes (rectangle, circle, polygon) in its own frame that combine into one outline (Phase 1; multi-piece editing in the Carpet Editor, Phase 5.14).
- **Wall features (`wall.reliefs`):** a group of 2D shapes on one face of a wall, combined into one outline, with one signed depth (box, niche, or flat colour) and one material ([D21](../decisions.md#d21-wall-reliefs), [wall relief groups](features/wall-relief-groups.md); house schema version 4).
- **Object groups (`area.objectGroups`):** named sets of two or more of an area's floor or overhead objects that are selected, moved, and turned as one; members keep their own placement ([object groups](features/object-groups.md), Phase 5.17).
- **Lights:** area-owned point, spot, or linear emitters, optional visible fixture templates, declared white/temperature/RGB capabilities, and authored defaults; see [lighting](features/lighting.md).
- **Light groups (`floor.lightGroups`):** floor-level sets of lights by ID, for switching them together ([lighting: light groups](features/lighting.md#light-groups)). A light group is not an object group.
- **Floor-level helpers:** measurement guides (`floor.guides`). The Phase 2 roof cuts (`floor.roofCuts`) were replaced by roofs in schema version 6 (Phase 19.2).
- **Roofs (`floor.roofs`, Phase 19.1, optional):** a flat sheet with fold lines: roof points with heights above the roof's eave height, an outline ring of point IDs and break lines between points, plus design, thickness, materials and ribs. Its faces, auto-folds and 3D meshes are derived and never stored. One cutting roof, on the top floor; in **Cuts walls** mode (`cutsWalls`, Phase 19.2) its underside limits the floor's walls, and with **Walls rise** (`wallsRise`) they extend up to it (derived; authored wall heights never change). Phase 19.3 (optional fields, no version change): break lines may be **step lines** (`kind`, `stepMm`, `raisedSide`, `stepFace`), a roof holds **holes** (`holes[]`) and **roof windows** (`windows[]`), both stored on the roof sheet in plan, and any floor may hold **attached canopies** (roofs with Cuts walls off, cutting nothing); see [roofs](features/roofs.md).

Each surface stores its own surface material inline ([D19](../decisions.md#d19-materials)), referencing a house image by stable ID. Image bytes are stored once in `textures/`; mapping settings live on each surface.

See [materials and objects](features/materials-and-objects.md) for capabilities and object contracts. The built-in template catalog ships with the server (`server/builtin-templates/`).

Flooring, walls, and room renderables belong to their area; they are not separate floor-level collections competing with the Floor → Areas hierarchy.

## Document tree, IDs, and the entity index

Where each entity lives in `house.json` (house schema version 6), its ID prefix, and its kind in the entity index:

| Entity | Path | ID prefix | Index kind |
| --- | --- | --- | --- |
| House | root | `h_` | `house` |
| Building floor | `floors[]` | `f_` | `floor` |
| Light group | `floors[].lightGroups[]` | `g_` | `lightGroup` |
| Guide | `floors[].guides[]` | `gd_` | `guide` |
| Roof (Phase 19.1) | `floors[].roofs[]` (optional) | `rf_` | `roof` |
| Roof point | `roof.points[]` | `rp_` | `roofPoint` (carries its roof ID) |
| Break line | `roof.lines[]` | `rl_` | `roofLine` (carries its roof ID) |
| Roof hole (Phase 19.3) | `roof.holes[]` (optional) | `rh_` | `roofHole` (carries its roof ID) |
| Roof window (Phase 19.3) | `roof.windows[]` (optional) | `rw_` | `roofWindow` (carries its roof ID) |
| Area | `floors[].areas[]` | `a_` | `area` |
| Floor shape group | `area.floor` (always one) | `fs_` | `floorSurface` |
| Source shape | `area.floor.shapes[]`, `carpet.shapes[]`, `relief.shapes[]` | `s_` | `shape` (carries its carpet or feature ID) |
| Polygon vertex | `shape.vertices[]` | `v_` | not indexed |
| Carpet | `area.floor.carpets[]` | `c_` | `carpet` |
| Wall | `area.walls[]` | `w_` | `wall` |
| Door or window | `wall.objects[]` | `o_` | `opening` |
| Wall feature | `wall.reliefs[]` (optional) | `wr_` | `relief` |
| Object (stairs and floor openings included) | `area.objects[]` | `o_` (stairs migrated from staircase areas keep `st_`) | `object` |
| Object group | `area.objectGroups[]` (optional) | `og_` | `objectGroup` |
| Light | `area.lights[]` | `l_` | `light` |
| Material preset | `materialPresets[]` | `mp_` | not indexed |

IDs are `<prefix>_<10 lowercase alphanumerics>` (`shared/domain/ids.ts`); the schema accepts any `^[a-z]+_[a-z0-9]{6,}$` ([API conventions](../architecture/api.md#conventions)). Built-in presets use the reserved `builtin_` prefix. Images (`img_`), house templates (`t_`), exports (`x_`), and render jobs (`job_`) are server resources referenced by ID, not entities inside the document. Template IDs referenced by instances are plain strings (built-in templates use names such as `window-style-1`). **Image ID namespace (Phase 17.1):** a `baseColorTexture.imageId` is either a house upload (`img_…`, in the house's `textures/images.json`) or a built-in texture (reserved prefix `builtinimg_`, for example `builtinimg_oakparquet`), which ships with the app in `server/builtin-materials/` and resolves in every house. Both match the ordinary ID pattern, so the House schema is unchanged; the catalog is `shared/domain/house/builtinMaterials.ts`; an unknown `builtinimg_` ID is a missing image (`404`), like a deleted upload.

**Unique IDs and references (implementation convention, review 2026-11-19):** every `id` in the document is unique across the whole house (not per list), and references the JSON Schema cannot check must point at the right things: an object group's `memberIds` are objects, lights, or carpets of its own area; a light group's `memberIds` are lights on its own floor; a wall's `sourceEdge.shapeId`, an object's `attachment.wallId`, and a light's `wallId` never name a shape or wall of another area. A wall or source shape that no longer exists is allowed (the wall becomes an orphan; a wall-mounted object or light is drawn where it is stored, as [lighting](features/lighting.md#wall-mounted-lights-phase-173) specifies). `documentIntegrityProblems` (`shared/domain/house/integrity.ts`) reports these; `validateHouseDocument` refuses any command that adds one (a fault the document already had does not block unrelated edits). The server reports them on read without refusing, so a house saved with an old fault stays openable, and `HouseRepository.write` refuses a write that adds one, or any new floor-name or roof-sheet fault, with `400 validation`. Duplicate area re-identifies every ID of the copy (walls, openings, features and their shapes, objects and effects, lights, carpets, object groups) and remaps its internal references; it refuses rather than copy an ID it missed.

The **entity index** (`shared/domain/house/entityIndex.ts`) maps every ID in the document to its kind, its document path, and its owning floor, area, wall, carpet, or feature. Commands, history, selection, and the properties panel address entities by ID through it, never by array index (implementation convention). It is rebuilt per document version.

`wall.reliefs` and `area.objectGroups` are optional, so older houses stay valid without them. Every other list is present, possibly empty. The yard fields `area.kind` and `area.fence` (Phase 17.2) are optional too: absent means a room.

### Schema versions and migrations

`schemaVersion` is the house document's format version; older files are migrated in memory on open and validated against the current schema (`shared/domain/house/migrations.ts`, [persistence](../architecture/persistence.md#document-contract)). A newer version than the app knows is refused.

| Version | Change | Migration |
| --- | --- | --- |
| 2 | Wall span ends attach to source-edge corners (`{ anchor, offsetMm }`), Phase 3 | `migrateV1Spans` |
| 3 | Staircases gain `direction`; existing ones become `up`, Phase 3 | `migrateV2Staircases` |
| 4 | A wall relief becomes a feature: its rectangle becomes its single shape in the face frame | `migrateV3Reliefs` |
| 5 | Staircase areas become stair objects and floor openings; areas lose `kind` and `staircase` (Phase 16.14, [migration](features/staircase-areas.md#migration-of-staircase-areas)) | `migrateV4Stairs` |
| 6 | Roof cuts become a roof (floors lose `roofCuts`); roofs gain `cutsWalls` and `wallsRise` (Phase 19.2, [migration](features/roofs.md#migration-of-roof-cuts)) | `migrateV5RoofCuts` |

Optional fields added later (`defaultWallHeightMm`, `wall.reliefs` in Phase 5.0, `area.objectGroups`, staircase `layout` and `run` in Phase 5.2 (removed with version 5), floor `positionMm`, `elevationMm`, `slabThicknessMm` and `slabMaterial` in Phase 16, `area.kind` `"yard"` and `area.fence` in Phase 17.2, light `mount`, `wallId` and `wallSide` in Phase 17.3) did not change the version. The Phase 16 floor fields are also filled with their defaults whenever a house is read (`fillFloorDefaults`, `shared/domain/house/floorDefaults.ts`, run by `migrateHouseDocument`), so the builder edits real values and the next save stores them; documents and Home Assistant copies without them stay valid.

Each placeable semantic element has a local group boundary and child geometry relative to that group. Parent placement/rotation carries its children. The [geometry-group specification](features/geometry-groups.md) owns bounds, source-versus-derived behavior, RealFloor derivation, and the polygon pencil.

## Coordinates and dimensions

House metadata owns `project.units`, defaulting to `"mm"`; all floors inherit it. The [units specification](features/units-and-grid.md) owns mixed-unit parsing, conversion, precision rules, and the confirmed scale of **1 internal length unit = 1 mm**, including fractions. Switching display units must not rescale geometry.

Every building floor view renders one floor in its own local frame. Area/group geometry uses parent-relative transforms; the height reference is the active floor's own finished-floor plane at local zero. Walls, attachments, objects, and lights move with their area. [D03 is resolved](../decisions.md#d03-coordinates-units-and-floor-local-geometry): the millimeter scale and local-group model are confirmed, while exact axis/rotation/pivot conventions are documented during implementation. A meter-based rendering adapter divides model lengths by 1000, including physical light distances.

RealFloor extends horizontally beneath outward wall thickness (outside- and center-aligned walls) without enlarging the authored room footprint. Its extent follows actual wall coverage.

### Floor placement and slab

Phase 16 (owner decisions, 2026-11-18; [D03](../decisions.md#d03-coordinates-units-and-floor-local-geometry)). Each building floor stores one placement relative to the house; its rooms, walls, slab and contents keep their floor-local coordinates and move with it.

| Field | Meaning | Default (absent) |
| --- | --- | --- |
| `positionMm` | plan offset `{ x, y }` of the floor's local frame in the house (mm); no rotation | `{ 0, 0 }` |
| `elevationMm` | finished-floor elevation above the house's zero (mm, ±100 m) | 0 |
| `slabThicknessMm` | slab thickness below the finished floor (mm, 0–1000; 0 = no slab) | 200 |
| `slabMaterial` | `SurfaceMaterial` of the slab's edges, underside and exposed top | built-in Concrete |

- **Order:** floors are ordered by `elevationMm` (ties keep document order), `floorsByElevation` in `shared/domain/house/floorPlacement.ts`; that order defines Up/Down.
- **Suggested elevation:** Add floor places the new floor above the highest one at the lower finished floor + its tallest wall (the house's default wall height when it has none; authored heights, walls risen to a roof ignored) + the new slab's thickness, e.g. 0 + 2600 + 200 = 2800 mm (`suggestedElevationAboveMm`). It is applied once; later wall edits never move a floor.
- **Placement transform:** floor-local → house is a translation by `(x, y, elevation)` in plan mm (`floorToHouseOffset`, `floorPointToHouse` in `shared/geometry/placement.ts`). Floor views do not apply it: the shown floor stays in its local frame. Whole-house views apply it: the builder's [whole-house overview](screens/floor-builder.md#whole-house-overview) (Phase 16.4) and the HA whole-house view.
- **Moving floors** (Phase 16.4): the builder's floor Move edits only `positionMm` and `elevationMm` of the selected floors, through one `moveFloorsCommand` (`shared/domain/commands/floorCommands.ts`, values rounded to 0.1 mm, elevation kept within ±100 m), one undo step; floors above do not follow (owner decision 6). Typing Position or Elevation in the panel edits the same fields. There is no stored floor-to-floor height: it is the difference of adjacent elevations.
- **Slab (derived, never persisted):** `buildFloorSlab` (`shared/geometry/floorSlab.ts`). Coverage is the union of every room's RealFloor solid (yards have no slab, Phase 17.2) (floor shape ∪ wall bands, so wall support is covered); touching or clashing areas merge into one part, disjoint ones stay separate. Stairs and floor openings that reach the floor are holes ([automatic cutouts](features/staircase-areas.md#automatic-cutouts), Phase 16.14). It is extruded downward from h = 0 by the thickness. Faces, all in the slab material: underside, side faces along the outline and hole edges, and a top face at h = 0 only where the slab is not under a room's RealFloor (normally none). No face is coplanar with a room floor; room floors keep their own materials.
- The builder's property panel shows them for a selected floor: Placement (Position, Elevation) and Slab (Slab thickness, Slab material).

Attachment height may reference a virtual overhead plane without generating a ceiling. Placement uses explicit millimeter offsets; percentage placement is post-MVP.

## Source and derived-data boundary

| Authoritative authored data | Derived data |
| --- | --- |
| Source shapes and stable IDs/local transforms (floor shape) | Union/compound outline, bounds, triangulation, boundary pieces |
| Wall identity, source-edge reference, span, alignment, height, thickness, materials | RealWall: shared/contact boundaries, source-to-face mappings, corner joins; RealFloor enlargement |
| Carpet frame and shapes; wall-feature shapes, depth, and material | Carpet outline (union, clipped to RealFloor); feature outline, strips, and relief prisms |
| Template instances, parameters, attachments, material assignments; object-group membership | Visible object geometry and wall openings |
| Stair and floor-opening objects (template, size, rise, switches, placement) | Floor cuts in every floor they reach (RealFloor and slab) and stair geometry |
| Roof sheet and mode; original wall heights; holes and roof windows on the sheet (19.3) | Roof meshes (cut by holes and windows, step faces); walls clipped by and risen to the roof's underside; whether each hole and window still fits |
| Light definitions and defaults | Emitters and their preview state |

If a derived path/mesh is cached, label it with the source/schema/geometry version and invalidate it when inputs change. It is not a second editable copy of the footprint. Data flows one way (floor shape → walls → RealFloor/RealWall), so no regeneration cycle exists.

Walls reference a stable source edge (shape ID + edge key) plus a span, never an array index of the derived outline. If that edge leaves the boundary, the wall is kept and flagged for repair rather than remapped. See [D04](../decisions.md#d04-footprints-walls-and-stable-boundaries).

The [shared-wall specification](features/shared-walls.md) keeps walls area-owned and derives RealAllWalls (union and contact-face removal) from them. Generated mesh faces carry source wall/area/material references; combining buffers does not replace that topology/provenance step. The shared result is not another independently editable persisted wall collection.

## Hide and Hidden

Phase 7.5 ([floor builder](screens/floor-builder.md#hide-and-hidden)). Areas, walls, wall features (`reliefs`), area objects, object groups, carpets, and lights carry an optional `hidden: boolean` (saved **Hidden**; absent means shown; no schema version change). Session-only **Hide** is editor UI state (`hiddenIds`) and never reaches `house.json`.

What is drawn is derived, never persisted: `floorView(floor, rule)` (`shared/domain/house/visibility.ts`) returns the floor as drawn for a rule `{ hiddenIds, showHidden }`, plus the ghosted IDs, the concealed lights, and every entity not drawn. Off things (session-hidden, or saved Hidden while Show hidden is off) are left out of the derived floor, so RealFloor and RealAllWalls are built without them: a hidden area's walls no longer join its neighbours'. Off lights stay in the floor (they keep shining) and are only concealed (no fixture or pin). Ghosted things (saved Hidden while Show hidden is on) stay; their walls are drawn as a separate faded RealAllWalls layer. The builder, its snapping, and the HA viewer use the same function; the viewer and exports pass `viewerVisibility` (no session hides, Show hidden off).

## Illustrative `house.json`

This is valid JSON, checked against the current House schema, showing a house with one floor and one rectangular area with a floor-shape group, a carpet, one light, and one raised outside-aligned wall with a window and a niche (a wall feature with negative depth). The remaining footprint edges have no raised walls yet. Surface materials are stored inline ([D19](../decisions.md#d19-materials)); `img_parquet01` refers to an entry in the server-owned image index, and `window-style-1` to a built-in template.

```json
{
  "schemaVersion": 6,
  "revision": 1,
  "id": "h_7f3k2q9m1a",
  "name": "My home",
  "units": "mm",
  "defaultWallHeightMm": 2400,
  "capMaterial": {
    "pbrMetallicRoughness": { "baseColorFactor": [1, 1, 1, 1], "roughnessFactor": 0.9, "metallicFactor": 0 }
  },
  "environment": {
    "location": {
      "latitudeDeg": 51.5074,
      "longitudeDeg": -0.1278,
      "timeZone": "Europe/London"
    },
    "northRotationDeg": 0,
    "sun": { "timeMode": "fixed", "fixedLocalDateTime": "2020-06-01T12:00:00" }
  },
  "materialPresets": [],
  "floors": [
    {
      "id": "f_etage1abcd",
      "name": "Etage1",
      "positionMm": { "x": 0, "y": 0 },
      "elevationMm": 0,
      "slabThicknessMm": 200,
      "slabMaterial": {
        "pbrMetallicRoughness": { "baseColorFactor": [0.62, 0.62, 0.6, 1], "roughnessFactor": 0.95, "metallicFactor": 0 }
      },
      "lightGroups": [],
      "guides": [],
      "areas": [
        {
          "id": "a_living0001",
          "name": "Living Room",
          "positionMm": { "x": 0, "y": 0 },
          "rotationDeg": 0,
          "floor": {
            "id": "fs_living0001",
            "material": {
              "pbrMetallicRoughness": {
                "baseColorTexture": { "imageId": "img_parquet01" },
                "baseColorFactor": [1, 1, 1, 1],
                "roughnessFactor": 0.6,
                "metallicFactor": 0
              },
              "extras": {
                "homeplan": { "tileSizeMm": { "x": 1200, "y": 200 }, "rotationDeg": 0, "offsetMm": { "x": 0, "y": 0 } }
              }
            },
            "shapes": [
              {
                "id": "s_room000001",
                "type": "rectangle",
                "positionMm": { "x": 0, "y": 0 },
                "rotationDeg": 0,
                "widthMm": 4525,
                "heightMm": 1428
              }
            ],
            "carpets": [
              {
                "id": "c_rug0000001",
                "name": "Carpet 1",
                "positionMm": { "x": 0, "y": 0 },
                "rotationDeg": 0,
                "material": {
                  "pbrMetallicRoughness": { "baseColorFactor": [0.45, 0.2, 0.18, 1], "roughnessFactor": 0.95, "metallicFactor": 0 }
                },
                "shapes": [
                  {
                    "id": "s_rug0000001",
                    "type": "rectangle",
                    "positionMm": { "x": 0, "y": 0 },
                    "rotationDeg": 0,
                    "widthMm": 2000,
                    "heightMm": 1400
                  }
                ]
              }
            ]
          },
          "walls": [
            {
              "id": "w_south00001",
              "sourceEdge": { "shapeId": "s_room000001", "edge": "bottom" },
              "spanMm": {
                "start": { "anchor": "start", "offsetMm": 0 },
                "end": { "anchor": "end", "offsetMm": 0 }
              },
              "heightMm": 2500,
              "thicknessMm": 200,
              "alignment": "outside",
              "materials": {
                "interior": {
                  "pbrMetallicRoughness": { "baseColorFactor": [0.95, 0.95, 0.93, 1], "roughnessFactor": 0.9, "metallicFactor": 0 }
                },
                "exterior": {
                  "pbrMetallicRoughness": { "baseColorFactor": [0.6, 0.3, 0.2, 1], "roughnessFactor": 0.95, "metallicFactor": 0 }
                }
              },
              "objects": [
                {
                  "id": "o_window0001",
                  "name": "Window Style 1 1",
                  "templateId": "window-style-1",
                  "templateVersion": 1,
                  "parameters": { "widthMm": 1200, "heightMm": 1000 },
                  "flip": { "x": false, "z": false },
                  "materialOverrides": {},
                  "placement": { "distanceAlongWallMm": 1000, "bottomMm": 900 }
                }
              ],
              "reliefs": [
                {
                  "id": "wr_niche00001",
                  "name": "Feature 1",
                  "face": "interior",
                  "depthMm": -150,
                  "material": {
                    "pbrMetallicRoughness": { "baseColorFactor": [0.95, 0.95, 0.93, 1], "roughnessFactor": 0.9, "metallicFactor": 0 }
                  },
                  "shapes": [
                    {
                      "id": "s_niche00001",
                      "type": "rectangle",
                      "positionMm": { "x": 3200, "y": 1200 },
                      "rotationDeg": 0,
                      "widthMm": 600,
                      "heightMm": 600
                    }
                  ]
                }
              ]
            }
          ],
          "objects": [],
          "objectGroups": [],
          "lights": [
            {
              "id": "l_pendant001",
              "name": "Light 1",
              "fixture": null,
              "fixtureVisible": true,
              "geometry": { "type": "point", "lengthMm": 1000, "widthMm": 12 },
              "positionMm": { "x": 0, "y": 0 },
              "elevationMm": 2300,
              "rotationDeg": 0,
              "spot": { "tiltDeg": 0, "beamAngleDeg": 40, "softEdge": 0.3 },
              "renderCapabilities": { "colorModes": ["fixedWhite", "colorTemperature", "rgb"] },
              "defaults": {
                "enabled": true,
                "brightness": 1,
                "outputLumens": 800,
                "color": { "mode": "fixedWhite", "kelvin": 3000, "rgb": [255, 255, 255] }
              }
            }
          ]
        }
      ]
    }
  ]
}
```

The floor-surface object is the local geometry group; it has no transform of its own (the area's `positionMm` and `rotationDeg` place it). A carpet has its own frame inside the area; a wall feature has none, and its shapes sit in the face frame (x along the wall from its span start, y up from the floor). RealFloor and RealWall are deliberately not stored.

An empty floor has its `id`, `name`, and empty `areas`, `lightGroups`, and `guides` arrays (no `roofs`). An instance's contract (`Wallable` here) comes from its template's metadata, not from the instance; the instance stores `templateId` and `templateVersion`, its `parameters`, `flip`, and `materialOverrides`. Shape schemas cover rectangles, circles (radius and position), and polygons (vertex lists); triangles are polygons. Rectangle and circle positions are their centres ([coordinate conventions](features/geometry-groups.md#coordinate-conventions)).

`sourceEdge` anchors the wall to the rectangle's bottom edge ([D04](../decisions.md#d04-footprints-walls-and-stable-boundaries)); `spanMm` is the authored extent along it: each end is an offset from one corner of the edge (`anchor` `start` or `end`), and an end at offset 0 follows that corner when the floor is resized. Polygon edges use vertex-ID pairs (`<fromVertexId>><toVertexId>`) instead of edge names. Version history: [schema versions and migrations](#schema-versions-and-migrations).

The window omits editable depth: in this unshared example it derives host depth from the wall's `thicknessMm`. In a shared wall it fits the effective depth defined in the [shared-wall specification](features/shared-walls.md#openings-and-host-depth). Generated support beneath the wall is additional geometry, not a rewrite of the measured footprint.

The `revision` belongs to the house document. A render snapshot identifies the house revision, the selected floor, templates, and asset versions; each view or render uses one floor.

## Derived geometry and local renderers

Each supported abstract object type has a locally defined `.ts` or `.tsx` renderer/geometry adapter. JSON stores model data; it does not contain executable renderer code or arbitrary module paths to load.

Recommended pipeline:

```text
house.json (active floor) → validate models and template parameters
           → resolve the floor shape: union/compound of source shapes
           → resolve authored wall extents and shared/contact regions
           → build physical wall boundaries with material/source mappings
           → resolve attachments, openings, and floor support
           → subtract the cuts of stairs and floor openings (any floor they reach)
           → apply roof-profile upper cuts without adding ceilings
           → generate meshes, materials, and emitters → Three.js preview
                                                     → optional geometry export
```

Use a local registry to dispatch known model types to their renderer/adapter. The same geometry logic should serve preview and any STL export so the exported shape agrees with the editor. Keeping core geometry in `.ts` and React presentation in `.tsx` is a recommendation, not a requirement to use both for every type.

The [renderer architecture](../architecture/renderer.md) keeps authoritative abstract data in a shared typed document layer and live Three.js objects in a separate rendering runtime. React panels issue model commands; runtime picking/dragging produces selection/edit events. D13 selects the React-hosted Three.js runtime with this model/geometry separation.

Every object template is a glTF asset rendered by one shared template adapter driven by its [Homeplan metadata](features/object-templates.md) (resizing, slicing, part rules, flips, openings), rather than unique rendering code per object. Placed instances reference the template version and carry stable IDs, parameters, and placement.

MVP persists stable object IDs and light capabilities/defaults only. [Controllable declarations](../home-assistant/controllables.md) and card metadata are post-MVP; Home Assistant entity/action bindings will never live in `house.json`.

Three.js can preview in-memory mesh geometry such as `BufferGeometry`; an intermediate STL file is not required for each edit. STL is a possible derived geometry output, and Three.js provides an STL exporter. STL carries surface geometry without materials, textures, or unit metadata, so retain the abstract JSON and richer scene data for realistic rendering. [Three.js geometry documentation](https://threejs.org/docs/pages/BufferGeometry.html), [STL exporter documentation](https://threejs.org/docs/pages/STLExporter.html).

Retain editable source shapes and walls and regenerate RealFloor/meshes when inputs change. Generated mesh files are derived artifacts, not replacements for `house.json`.

A roof in Cuts walls mode (Phase 19.2) is authored data on its floor in `house.json`; the clipped and risen walls are derived from it and the original wall heights and object IDs, and final rendering/exported geometry applies it consistently. Measurement guides are persisted per floor ([D16](../decisions.md#d16-interaction-defaults-and-support-limits)). See [roofs](features/roofs.md) (which replaced the [roof cutouts](features/roof-cutouts.md)) and [measurement guides](features/measurement-guides.md).

## Geometry implementation notes

Resolved policy lives in [D04](../decisions.md#d04-footprints-walls-and-stable-boundaries) and [D05](../decisions.md#d05-walls-between-adjacent-areas). Remaining items are implementation conventions or post-MVP:

- Kernel tolerances, circle chord tolerance, and compound-region encoding (convention).
- Corner-join construction details within the 2.5D wall union (convention); curved walls are post-MVP.
- Triangulation and any manifold/solid guarantees needed for STL export. Floor placement and the slab are [above](#floor-placement-and-slab); stairs cut the floors they reach automatically ([D06](../decisions.md#d06-staircases-and-connected-floors), Phase 16.14).
- Validation rules and rendering behavior for empty or invalid models.
- API payloads and the derived-cache lifecycle.
- The JSON Schemas are built (`shared/domain/schemas/`); [object models](object-models.md) lists their properties.
