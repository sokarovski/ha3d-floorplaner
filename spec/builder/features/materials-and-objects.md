# Materials, walls, and object contracts

Updated: 2026-11-16.

Status: owner requirements. Defaults are resolved in [D04](../../decisions.md#d04-footprints-walls-and-stable-boundaries), [D05](../../decisions.md#d05-walls-between-adjacent-areas), and [D07](../../decisions.md#d07-template-library-and-updates). Carpets are in MVP Phase 1; their selection, handles, and Carpet Editor are Phase 5.14. Field names follow `shared/domain/schemas/`.

See the [Floor Builder screen](../screens/floor-builder.md) for editing context and the [floor data model](../model.md) for persistence and geometry generation.

## 1. Materials and image textures

A **texture** is an image applied to a surface, such as a parquet image. A **material** describes the surface's appearance, combining textures with properties such as color and roughness. Three.js supports these through materials such as `MeshStandardMaterial`. [Material documentation](https://threejs.org/docs/pages/MeshStandardMaterial.html).

Confirmed capabilities:

- Each area's flooring can have a material/image texture, such as parquet.
- Each wall has separate interior and exterior materials/textures.
- Upload JPEG, PNG, and WebP images into the house folder and reuse them from a house-wide image library for any rendered surface with a suitable material slot. See [house image uploads](house-images.md) for asset storage, selection, and mapping.
- Material assignments persist with the model and appear in previews and rendered image exports.

Each surface carries its own material in the open **glTF 2.0 material** format ([D19](../../decisions.md#d19-materials)): a base color image from the house images, a color/tint, Shininess (stored as glTF roughness), metallic, and its physical tile size, rotation, and offset, which render as the standard `KHR_texture_transform`. There is no separate material editor: you edit the surface, then save it as a preset (in the [material chooser](#material-chooser)) to reuse those values on other surfaces, where applying the preset copies them. Parquet therefore tiles at a consistent physical size instead of stretching once over each room. Normal maps and other texture maps are post-MVP.

**Built-in textured materials (Phase 17.1, owner decision 2026-11-18).** The [material chooser](#material-chooser) lists, after the plain built-ins (Plain white (cap), Default flooring, Default wall paint, Concrete, Dark wood), the read-only textured presets that ship with the app:

| Preset | Built-in image | Tile size | Roughness |
| --- | --- | --- | --- |
| Oak parquet | `builtinimg_oakparquet` (oak planks) | 1600 mm | 0.55 |
| Walnut | `builtinimg_walnut` (walnut planks) | 1600 mm | 0.5 |
| Ash | `builtinimg_ashplanks` (pale ash planks) | 1600 mm | 0.6 |
| Grey tiles | `builtinimg_greytiles` (grey stone tiles 60 cm) | 1200 mm | 0.35 |
| White tiles | `builtinimg_whitetiles` (white tiles 15 cm) | 600 mm | 0.25 |
| Terracotta tiles | `builtinimg_terracotta` (terracotta tiles 30 cm) | 1200 mm | 0.75 |
| Slate tiles | `builtinimg_slatetiles` (slate 60 × 30 cm, running bond) | 1200 mm | 0.6 |
| Granite | `builtinimg_granite` (speckled granite tiles 60 cm) | 1200 mm | 0.3 |
| Decking | `builtinimg_decking` (wood decking) | 1160 mm | 0.8 |
| Lawn | `builtinimg_lawngrass` | 2400 mm | 0.95 |
| Paving | `builtinimg_paving` (sandstone paving, running bond) | 1200 mm | 0.85 |
| Aluminium roofing | `builtinimg_aluminium` (light standing-seam metal, pans 500 mm) | 2000 mm | 0.4 (metallic 0.35) |

Aluminium roofing (Phase 19.1, owner 2026-11-18) is the plain light-metal roof covering; with Terracotta tiles and Slate tiles it is one of the v1 roof tops ([roofs](roofs.md#designs)). Its preset carries a metallic factor (every other built-in is 0). Choosing one copies it onto the surface like any preset (untinted, rotation and offset 0), and the copy can be adjusted. The images are procedural 512 × 512 PNGs generated deterministically by `npm run materials:build` (`scripts/materials/textures.ts`) into `server/builtin-materials/`; the catalog (IDs, names, tile sizes, roughness) is `shared/domain/house/builtinMaterials.ts`. The texture picker (Change… on a material's image) shows the house's images and, below them, the **Built-in textures**. Built-in textures are not house uploads: they are not listed, renamed or deleted in the house's image library, and a house never stores a copy; exports and HA snapshots freeze the ones a house uses ([API](../../architecture/api.md#images), [production integration](../../home-assistant/production-integration.md)). A user-defined installation-wide material library is still deferred ([D19](../../decisions.md#d19-materials)).

“Interior” and “exterior” refer to the sides facing into and away from the owning area, independent of the direction in which the boundary was drawn. They do not necessarily mean inside/outside the entire building. Wall tops, exposed ends, and opening reveals use the house cap material ([D05](../../decisions.md#d05-walls-between-adjacent-areas)).

### Material chooser

Owner request (2026-11-20; the first step of the texture and preset editor). The material editor's header has one button, **More…**, in place of the earlier Presets menu; it opens the **material chooser**, built like the object chooser (`MaterialPickerPopup.tsx`, `shared/domain/materials/materialLibrary.ts`):

- **Search** over names, groups and "textured"/"plain", and **category chips** with counts: All, **Used in this house**, **House presets**, then the built-in categories, a fixed list (owner): Paint and plain (Plain white (cap), Default wall paint, Default flooring, Concrete), Wood (Dark wood, Oak parquet, Walnut, Ash), Tiles and stone (Grey tiles, White tiles, Terracotta tiles, Slate tiles, Granite), Outdoor (Decking, Lawn, Paving), Roofing (Aluminium roofing). Every saved preset is in House presets; presets carry no category of their own (no schema change).
- **Used in this house:** the distinct materials the house's surfaces carry now (walls, rooms, carpets, slabs, roofs, objects' own colours; the presets list itself not), most used first, each with its surface count, named after the preset it equals, else Custom, Custom 2, ….
- **Swatches:** the texture repeated at its real tile size over 1.5 m of surface and tinted by the colour, or the flat colour, with a sheen for shiny materials.
- **Preview** of the selected tile (the first one before a choice): a larger swatch (3 m of surface), its group, texture, colour, tile size, Shininess and Metallic; a house preset there has **Rename** and **Delete** (surfaces keep their materials; Undo brings it back). Built-ins are read-only.
- **Apply** (or a double click, or Enter on the search) copies the material onto the surface, as choosing a preset did; the chooser opens with the surface's own material selected. **Save current as preset…** in the footer saves the surface's material as a house preset (disabled for a mixed selection).
- **New material from image…** (owner, 2026-11-20) in the footer: a form (`newMaterialFromImageForm`) with the image, a material name, the **width of one repeat** (the height follows the image's proportions), Shininess and Metallic. It uploads the image, stores those values with it as its proposed values, saves an untinted textured house preset of that name, and applies it to the surface.

### Proposed texture values

Owner request (2026-11-20). A texture image carries **proposed material values**: the real size of one repeat (tile size), Shininess (stored as roughness) and metallic (`shared/domain/materials/textureHints.ts`). Built-in textures have them in code (the table above); an uploaded image keeps them in its `images.json` entry (`texture`, [house images](house-images.md)), set by New material from image or `PATCH` ([API](../../architecture/api.md#images)); older uploads have none. **Choosing a texture** in a material's Texture field applies them (tile size, Shininess, Metallic; a surface that had no texture also loses its tint, which would colour the new texture); the values can then be adjusted as before. Rotation and offset are not proposed.

The rest of the texture and preset editor (a library view, editing an image's proposed values afterwards, editing presets themselves, rotation in the swatches) is still open.

## 2. Wall thickness, alignment, and flooring support

Walls are guides extruded from straight floor-shape edges. A wall has a **thickness** property: the wall width across its edge, distinct from wall length and height. Thickness is aligned **outside**, **inside**, or **center** relative to that edge. The rendered result is RealWall ([geometry groups](geometry-groups.md#authored-guides-and-derived-geometry)).

- **Outside alignment:** the boundary is the wall's inner face, and the wall thickness extends away from the area. This supports a room drawn from measured interior dimensions.
- **Inside alignment:** the boundary is the wall's outer face, and the thickness extends into the area.
- **Center alignment:** half the thickness on each side of the boundary.
- When thickness extends outside the floor shape (outside or center alignment), RealFloor is enlarged underneath the wall so the wall is supported by the floor. Without walls, RealFloor is just the floor shape.

For MVP, this extension is horizontal within the independently rendered building floor. Its size follows the actual wall footprint: for example, a `200 mm` outside-aligned wall adds coverage up to its outer face along that span. It does not change the measured room size, create another building level, or require floors to be stacked.

Default: outside alignment, because most users measure the clear interior dimensions.

### Keep authored dimensions separate from generated flooring

Preserve the original area footprint as the measurement and wall-placement reference. Derive the flooring/slab coverage from that footprint plus the horizontal footprints of its walls. Enlarging the generated floor must not enlarge the authored room dimensions or move the wall reference on every regeneration.

RealFloor is the only place this enlargement exists. Data flows one way: floor shape → walls → RealFloor/RealWall. Generated geometry never rewrites the floor shape or the walls.

Construction: union the floor shape with the actual outward wall bands, including required corner joins, rather than blindly expanding the whole area by a single thickness. This accommodates per-wall thickness, alignment, and trimmed spans. When wall parameters change, regenerate support coverage and preserve the room's authored dimensions.

Stairs and floor openings cut holes in ordinary solid flooring: the cut is subtracted after the floor/support coverage is built, so this union does not refill a stairwell. See [stairs and floor openings](staircase-areas.md) (Phase 16.14).

Example intent: a room measured `4525 mm` across retains that authored measurement when an outside-aligned wall gains thickness; the generated slab extends underneath the wall. Inside alignment can reduce the usable clear interior, which the editor should distinguish from the authored boundary measurement.

Overlapping walls automatically generate a shared physical region with each room's interior material on its exposed side; face-touching walls omit the internal interface. The [shared-wall specification](shared-walls.md) owns preparation, the Touching and Full clash detents, junctions, and openings. Where the RealFloors of two areas overlap, they are unioned per floor and each part keeps its own area's floor material. Doorways get no threshold geometry in MVP. Deriving support coverage must not merge independently editable areas.

## 3. Object templates and resizing

Every object is an instance of a **glTF 2.0 template** with Homeplan metadata ([D17](../../decisions.md#d17-object-asset-format-and-template-metadata)). The [object templates specification](object-templates.md) owns the format, metadata, and resize engine. Built-in templates ship in Phase 1; imports follow in Phase 2.

No mesh format knows a window's resizing rules by itself: stretching a mesh also stretches its frame. The template's metadata supplies them. For example, Window Style 1 slices its width and height so the 60 mm frame keeps its size while the glass grows, and a pinned center mullion stays thin. The persisted instance references its template and stores its chosen values.

A template declares:

- Stable template identifier and version.
- Parameters with units, defaults, and minimum/maximum limits, derived from its per-axis resize modes.
- Placement/attachment capabilities, contact, and any default placement.
- Material slots.
- An opening definition when the object needs a cutout in its host wall.

Validate values before committing changes and show applicable limits in the property panel. An out-of-range value is rejected with feedback: the field keeps the draft and shows the limit, and the model is unchanged. Drags clamp to the limits instead. Template references are template IDs and versions, never executable module paths in JSON.

## 4. Wall children: `Wallable`

`Wallable` means an object that creates a cutout in its host wall, such as a door or window. The wall owns the opening-fitting child, and its renderer updates the opening with that child's position and dimensions. Merely mounting an object on a wall does not make it `Wallable`: a surface-mounted air conditioner is `Areable` with a wall attachment.

Confirmed door/window behavior:

- Choose predefined styles, for example Window Style 1.
- Edit object properties such as width and height; styles can define allowed limits.
- Derive the object's host depth from the wall's thickness rather than duplicating that editable value on each instance.
- Select an object to inspect/edit its properties in the selection panel.
- Move it freehand along its host wall.
- Cut the wall at the object's position to form the corresponding door/window opening.
- Regenerate the object and opening together when its size or placement changes.

Placement coordinates are distance along the wall and vertical offset above the floor. Dragging stays in the wall's plane; mounting to another wall is a separate operation. Editing wall thickness recomputes inherited opening depth and the cutout for a door/window, subject to template constraints. A mounted appliance instead retains its own body depth unless its template explicitly defines another behavior.

For a prepared shared wall, opening generation must account for all contributing solids so a neighboring wall cannot refill the aperture. Each opening has exactly one host wall and cuts the full prepared depth ([shared-wall openings](shared-walls.md#openings-and-host-depth), [D05](../../decisions.md#d05-walls-between-adjacent-areas)).

Templates should generate the opening separately from the visible frame/door/glass geometry. The wall generator consumes openings to build the wall with holes. Cutting a hole is geometry behavior, not merely making an image region transparent. The cutting algorithm is an implementation detail of the 2.5D wall construction.

Opening validation (review inference):

- Dragging an opening clamps it within its wall and stops it at neighboring openings.
- If shortening or lowering a wall leaves an opening that no longer fits, the opening is kept, flagged invalid, and not cut until it is fixed.
- Deleting a wall deletes its hosted openings in the same undoable command.

## 5. Area ornaments and shared object contracts

`Areable` means an area-owned object that does not cut the walls, such as a TV, picture, sofa, or air conditioner. It has a template, properties, placement, and renderer. It may stand on the flooring, attach to a virtual overhead reference, or mount on a wall according to its template. Ceilings are never rendered. Use `Areable` as the contract name for this distinction.

Contract composition:

| Contract/capability | Responsibility |
| --- | --- |
| `SceneObject` | Shared identity, template reference, editable parameters, and rendering behavior |
| `Areable` | Area-owned object with no wall cutout, including wall-mounted ornaments/appliances |
| `Wallable` | Object hosted by a wall that defines a cutout and inherits its opening depth |
| `Staircasable` | A stair: an area object standing on the floor that cuts the floors it reaches (Phase 16.14) |
| `Floorable` | A flat 2D shape hosted by an area's floor and lying on it, such as a carpet. The floor counterpart of `Wallable`, but it cuts nothing and has no thickness |
| Wall attachment | Shared placement behavior that can be used by either contract; it does not itself create an opening |

Keep ownership and attachment separate. A wall-mounted air conditioner, TV, or picture remains in its area's object collection and references its attachment wall. Its own body depth is independent of wall thickness. A door/window is `Wallable` and defines the wall opening. Both contracts can reuse wall-plane placement behavior and selection.

Attachment semantics are part of each template's metadata ([object templates](object-templates.md)). Ornaments are reusable across the house: a template is placed in any number of areas and floors, each placement an independent instance. Phase 1 ships a small built-in glTF catalog, chosen during implementation. Importing GLB/glTF and STL models into the house's template library is Phase 2.

## 6. Carpets

A Carpet (MVP Phase 1) is a **`Floorable`**: a flat 2D shape hosted by its area's floor, the way a door or window is hosted by its wall. It attaches only to the floor, lies on it as an overlay, and is listed under the area's Floor row in the tree.

- An area can have multiple carpets.
- Each carpet has its own position and material/image texture.
- Reuse the flooring shape-authoring approach: rectangles, circles, and pencil polygons combined into one footprint **per carpet**.
- Preserve each carpet as a separate object rather than combining all carpets with each other or replacing the area's floor.

Controls are selection, shape editing, and placement within the area. Preserve source primitives for later edits, as for area flooring.

MVP defaults (review inference): carpets are flat overlays with a small fixed visual offset and no thickness. Overlapping carpets draw in tree order, later ones on top; a selected carpet's **Actions** menu has **Bring forward** and **Send backward** (one step each, one undo step; Phase 7.3). Carpets are clipped to their area's RealFloor, move with the area, and rotate in the floor plane only. A carpet is one object in the overview and the Room Editor (owner, Phase 5.14): clicking it selects the whole carpet, which is shaded in the selection tone with a centre cross, and corner and side handles on its box, drawn like a shape's. The handles scale **all pieces together** (opposite side or corner fixed; Option about the centre; Ctrl without snapping; typed `W x D`; a carpet with a circle scales uniformly); since Phase 7.2 they are the [shape group](../screens/floor-builder.md#shape-groups) box handles that rooms and wall features share. Each is one undo step. **Rotate** (Q, in the overview and the Room Editor) turns it about its centre, and **Nudge** moves the whole carpet by any box corner, edge midpoint, or its centre (see [moving and turning placed things](../screens/floor-builder.md#moving-and-turning-placed-things)). Its pieces are edited in the **Carpet Editor**, one level inside the Room Editor: double-click the carpet in the Room Editor (in the overview the first double-click opens its room), or double-click/Enter its tree row. There the room's walls and objects fade, the carpet's outline is dashed, the toolbox has the shape, measuring, and view tools (no wall tools), and Rectangle, Circle, Polygon, Corner edit, Select resize handles, and Nudge act on the carpet's pieces in its own frame; the room still serves as a snap target. Deleting a piece is allowed while another remains. The header reads "Editing Living room › Carpet 1"; the room name or **Done** returns to the Room Editor with the carpet selected, as does a double-click outside the carpet. Escape, as at every level since Phase 7.1, cancels a running operation, then returns to Select, then clears the selection, then leaves the Carpet Editor.

Stored fields: `id`, `name`, `positionMm`, `rotationDeg`, `material` (a surface material), and `shapes` (at least one). Implementation conventions (`src/renderer/carpetGeometry.ts`, `src/features/floor-builder/tools/carpetEditing.ts`): a carpet is the union of its pieces in its own frame, clipped to the area's RealFloor; it is drawn 2 mm above the floor plus 0.5 mm per position in the area's carpet list; texture coordinates are carpet-local millimetres, so a texture tiles at physical size and moves and turns with the carpet. Scaling a multi-piece carpet keeps rectangles on the carpet's axes as rectangles and turns other pieces into polygons; sizes are rounded to whole millimetres. A double-click counts as outside the open carpet beyond its box plus 12 px. Staircase areas offer no carpets (their Floor row is the Opening). While a room is being edited, floors, walls, and carpets show plain base colours without image textures; exports keep textures.

## 7. Selection context and persistence

The house tree shows doors, windows, and wall features (boxes and niches, [wall relief groups](wall-relief-groups.md)) under their host wall, carpets under their area's Floor row, objects under the area's **Objects** row (an [object group](object-groups.md) lists its members under it), and lights under the area's **Lights** row. Light groups appear by reference under the building floor; each light remains under its area.

Selecting an object shows its template-defined properties. Wall selection additionally exposes thickness, alignment, and interior/exterior materials (a **Materials** group); room selection shows a **Flooring** group with the floor material. Viewport interaction is direct selection of visible objects or editor markers for invisible lights, alongside tree selection.

Persist surface materials, template references/parameters, child attachments, and carpet shapes in `house.json`. [Lighting](lighting.md) owns light settings and group references. Images and templates are files in the house's server-owned asset libraries; generated holes and meshes are derived geometry. Property names are tabled in [object models](../object-models.md).

Post-MVP: objects/templates may declare [controllables](../../home-assistant/controllables.md) for Home Assistant. MVP keeps stable instance IDs so those declarations can be added later.

## 8. Verification scenarios

- A parquet image appears on flooring; the wall's two sides can display different images.
- Outside wall thickness generates floor coverage underneath it without changing the authored interior measurement or recursively growing the area.
- Changing alignment/thickness regenerates the wall and its inherited-depth objects consistently.
- Resizing a constrained window preserves template-defined frame dimensions, updates glass, and updates the host opening.
- Moving/removing an opening object moves/removes its cutout; selecting it exposes its editable properties and limits.
- A wall-mounted ornament can attach without requiring an opening.
- Multiple carpets retain independent footprints, transforms, and materials.
- Lighting, fixture visibility, output/color defaults, and groups follow the [lighting specification](lighting.md).

## Selecting and handling objects

Owner requirement (Phase 5 follow-up): hovering an object outlines its box (the built model's bounds in its own axes) and names it; a selected object shows its box in the selection tone. A single selected object standing on the floor or hung overhead also shows a **Move** cross at its bottom centre (drag on the floor plan with inference; Ctrl free); one drag is one undo step. Grips are dots and Move is a cross, the same markers as shapes, carpets, and rooms (second round). Select has no turn grip. Turning is **Rotate** (Q), and Nudge grabs any box corner, edge midpoint, or the centre, as for every placed thing (see [moving and turning placed things](../screens/floor-builder.md#moving-and-turning-placed-things)). Wall-hosted objects move along their wall with Nudge.
