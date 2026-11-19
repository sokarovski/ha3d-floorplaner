# Object templates: glTF assets with placement metadata

Updated: 2026-11-18 (Phase 17.3 outdoor family).

Status: resolved ([D17](../../decisions.md#d17-object-asset-format-and-template-metadata)). Owner requirements: reuse an open 3D standard instead of a project-specific format, add the application's own properties (direction, resizing, stacking, attachment) on top of it, and keep reusing existing STL collections. Versioning follows [D07](../../decisions.md#d07-template-library-and-updates). The metadata schema is implemented in TypeBox in `shared/domain/templates/metadata.ts` (published as JSON Schema) and the resize engine in `shared/geometry/templateResize.ts`.

Phase 1 ships built-in templates in this format and implements everything needed to place and resize them. Phase 2 adds importing (GLB/glTF and STL) and metadata authoring in the [Object Editor](../screens/object-editor.md).

## One format for every object

Every object template is a **glTF 2.0** asset: built-in doors, windows, ornaments, appliances, light fixtures, staircases, and imported models alike. glTF is the Khronos open standard for 3D assets, and Three.js loads it with `GLTFLoader`. [glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html), [GLTFLoader documentation](https://threejs.org/docs/pages/GLTFLoader.html).

The standard already covers most of what a template needs. Only what it lacks is ours:

| Need | Provided by |
| --- | --- |
| Geometry, part hierarchy, part names | glTF meshes and nodes |
| Units and axes | glTF: meters, right-handed, **+Y up**, **front faces +Z** |
| Materials and texture coordinates | glTF PBR metallic-roughness materials and UVs |
| Texture placement | `KHR_texture_transform` |
| Point and spot emitters for fixtures | `KHR_lights_punctual` |
| Compression | `KHR_mesh_quantization`, `EXT_meshopt_compression`, `KHR_draco_mesh_compression` |
| Contract, direction rules, resizing, stacking, attachment, openings, linear emitters | **Homeplan metadata** in glTF `extras` (below) |

`extras` is the standard's own slot for application-specific data on any glTF object, so a template stays a valid glTF file that any viewer opens. Blender's glTF exporter writes custom properties into `extras`, so templates can be prepared in Blender as well as in the Object Editor. Three.js exposes `extras` as `userData`.

Not used in MVP: animations, skins, morph targets, cameras, and `KHR_materials_variants`. They are ignored on load with a warning. An asset whose `extensionsRequired` lists an unsupported extension is rejected.

## Template versions are glTF files

- **Built-in templates** ship with the application as read-only `.glb` files, one per version.
- **House templates** form the house's reusable object library, the counterpart of its [image library](house-images.md): every area and floor of the house can place them. Each lives in its own server-owned folder ([persistence](../../architecture/persistence.md)):

```text
assets/templates/<template-id>/
  source.glb | source.gltf | source.stl   # the original upload, never modified
  base.gltf                    # the normalized import: glTF JSON without Homeplan metadata or root transform
  geometry.bin                 # normalized buffers, shared by every version
  textures/                    # textures extracted from the upload (<n>.png|jpg|webp)
  draft.json                   # the Object Editor draft: node tree, materials, prefilled metadata, root transform
  v1.gltf                      # version 1: glTF JSON with Homeplan metadata
  v2.gltf                      # version 2
  thumbnail.svg                # front-elevation silhouette for the picker, written with each version
```

Each `vN.gltf` is `base.gltf` plus the version's metadata (scene `extras.homeplan`), node rules (node `extras.homeplan`), and one added root node named `HomeplanRoot` that holds every scene node; its `matrix` is the normalization root transform (omitted when it is the identity). The transform is stored there rather than baked into `geometry.bin`.

Each `vN.gltf` is a complete, valid glTF 2.0 document that references the shared buffer and textures by relative URI. A new version changes only JSON: metadata plus the normalization root transform. Geometry is therefore stored once. Instances pin template ID and version and adopt new versions explicitly ([D07](../../decisions.md#d07-template-library-and-updates)).

Template resource resolution uses the identifier namespace: house template IDs are generated with the `t_` prefix; built-in IDs are hyphenated slugs without underscores. The viewport resolves these routes directly, independently of asynchronous picker-list loading, so a saved house template can load immediately after reopening a house.

Before a version is saved, it passes the Khronos [glTF Validator](https://github.com/KhronosGroup/glTF-Validator) with zero errors and the Homeplan metadata validation. Implementation note: only development builds of the validator are published on npm, so the project pins `gltf-validator` `2.0.0-dev.3.10`, a documented exception to the stable-version rule. Informational `UNUSED_OBJECT` messages for UV sets that no texture references yet are expected, because UVs exist for later material overrides.

## Importing (Phase 2)

- **GLB or glTF:** units and axes come from the standard. Existing `extras.homeplan` metadata pre-fills the Object Editor.
- **STL:** converted on import into the same folder structure, with one mesh node and one default material slot. STL declares no unit or axes, so the importer asks for the source unit (or one known dimension) and the up and front directions. That correction is stored as the normalization root transform. Meshes without usable UVs get a box projection at the material's physical texture size.
- **Limits:** 100 MB per model file ([D16](../../decisions.md#d16-interaction-defaults-and-support-limits)); embedded textures follow the [image limits](house-images.md).

Uploading is outside model history ([undo/redo](../undo-redo.md#uploads-and-other-file-operations)).

## Homeplan metadata

Asset-level metadata lives in the scene's `extras.homeplan`. Per-part rules live in the part node's `extras.homeplan`. Lengths are millimeters, like the house model; glTF geometry is converted from meters on load.

### Asset level

Window Style 1 as built (scene `extras`):

```json
{
  "homeplan": {
    "schemaVersion": 1,
    "kind": "window",
    "label": "Window Style 1",
    "contract": "Wallable",
    "attachment": { "hosts": ["wall"], "contact": "back", "defaultHostSide": "interior", "defaultPlacement": { "bottomMm": 900 } },
    "resize": {
      "x": { "mode": "slice", "startMm": 60, "endMm": 60, "minMm": 400, "maxMm": 3000, "defaultMm": 1200 },
      "y": { "mode": "slice", "startMm": 60, "endMm": 60, "minMm": 400, "maxMm": 2400, "defaultMm": 1000 },
      "z": { "mode": "fixed", "wallPosition": "center" }
    },
    "flip": { "x": true, "z": false },
    "opening": { "shape": "bounds", "clearanceMm": 0 },
    "materialSlots": { "frame": "Frame", "glass": "Glass" }
  }
}
```

The wall-mounted air conditioner as built:

```json
{
  "homeplan": {
    "schemaVersion": 1,
    "kind": "airConditioner",
    "label": "Air Conditioner",
    "contract": "Areable",
    "attachment": {
      "hosts": ["wall"],
      "contact": "back",
      "defaultHostSide": "interior",
      "defaultPlacement": { "horizontalAlign": "center", "verticalAlign": "top", "topInsetMm": 150 }
    },
    "resize": { "x": { "mode": "fixed" }, "y": { "mode": "fixed" }, "z": { "mode": "fixed" } },
    "flip": { "x": false, "z": false },
    "opening": null,
    "materialSlots": { "body": "Body" },
    "effects": [
      {
        "kind": "swirl",
        "enabled": true,
        "direction": "forward",
        "offsetMm": { "x": 0, "y": 80, "h": -90 },
        "color": [56, 140, 236],
        "sizeMm": 700
      }
    ]
  }
}
```

The air conditioner keeps its own body depth whatever the wall thickness, and creates no opening. The `150 mm` inset is the built-in's default.

Scene-level fields (`TemplateMetadata`):

| Field | Value |
| --- | --- |
| `schemaVersion` | `1` |
| `kind`, `label` | Free-form kind (`window`, `door`, `sofa`, `light`, `staircase`, `floorOpening`, `fence`, `gate`…) and picker label; `floorOpening` templates are offered by the Floor opening picker only; `fence` templates by no picker (they are drawn along a yard's walls) and `gate` templates by the Gate picker only ([yards](yards.md), Phase 17.2); `roofWindow` templates by the roof-window picker only ([roof windows](#roof-windows), Phase 19.3) |
| `contract` | `Wallable`, `Areable`, or `Staircasable` (a stair: an area object standing on the floor, with `widthMm`, `totalRiseMm` and `depthMm` size parameters on x, y and z, Phase 16.14) |
| `attachment.hosts` | Non-empty set of `wall`, `floor`, `overhead`, `staircaseArea` (legacy; read as `floor` since Phase 16.14), `roof` (Phase 19.3: a roof window), in order of preference: the first listed host the area offers is where a picked object is placed (Phase 9.1). `["wall", "floor"]` mounts on a wall (the area's first wall, in its middle) and stands on the floor only when the area has no wall (kitchen base units, radiators); `["floor", "wall"]` stands on the floor and can be moved to a wall in the panel. The instance's Host field offers every listed host |
| `attachment.contact` | `back`, `bottom`, `top`, or the name of an anchor node |
| `attachment.defaultHostSide` | `interior` or `exterior` (wall hosts) |
| `attachment.defaultPlacement` | Optional `bottomMm` (Wallable), `elevationMm`, `horizontalAlign` (`start`/`center`/`end`), `verticalAlign` (`bottom`/`center`/`top`), `topInsetMm`; applied only on insertion |
| `resize.x/y/z` | Per axis: `mode`; `parameter` (the size parameter, default `widthMm`/`heightMm`/`depthMm`; `null` = none); `title`; `description` (help text) and `quickPicks` (suggested sizes, mm) of the size parameter; `startMm`/`endMm` (bands); `startParameter`/`endParameter` (bands sized by a declared parameter); `minMm`/`maxMm`/`defaultMm`; `wallPosition` and `wallOffsetMm` (Wallable fixed depth) |
| `flip` | `{ x, z }`: which mirrors an instance may apply |
| `opening` | `{ shape: "bounds", clearanceMm }` for a Wallable, else `null` |
| `materialSlots` | Slot name → glTF material name, or `{ material, title?, choosable?, presets?, allowColor?, allowTexture? }` ([material choices](#material-choices)) |
| `category`, `tags` | Optional picker category (free text) and search tags (Phase 9); recommended categories: Seating, Tables, Beds, Storage, Kitchen, Bathroom, Appliances, Electronics, Heating and cooling, Lighting, Decor, Plants, Garden, Openings |
| `product` | Optional `{ manufacturer?, name?, code?, url?, description?, notes? }` |
| `formulas` | Optional named formulas: name → [formula](#formulas); rules and other formulas read them by name |
| `mirror` | Optional `{ materialSlot }`: a slot drawn as a reflective mirror surface (Phase 9.1) |
| `screen` | Optional `{ materialSlot }`: the slot whose meshes are a display's screen ([screens](#screens), Phase 8.8) |
| `properties` | Optional extra parameters: name → JSON Schema fragment with a `default` and `x-homeplan` annotations |
| `light` | Fixture defaults: `shape` (`point`/`spot`/`linear`), `outputLumens`, `colorModes`, `kelvin`, `minKelvin`, `maxKelvin` |
| `floorCut` | Optional `{ shape: "rectangle" \| "ellipse" }` (Phase 16.14): the object cuts the floor it stands on by its plan footprint (`widthMm` × `depthMm`, the x and z size parameters); an Areable with it is a floor opening. Not on a Wallable; a Staircasable cuts by its switches ([stairs and floor openings](staircase-areas.md#automatic-cutouts)) |
| `roofWindow` | Optional `{ minPitchDeg, maxPitchDeg }` (Phase 19.3): a roof window for slopes between these pitches; required on, and only on, a Wallable hosted by `roof` ([roof windows](#roof-windows)) |
| `effects` | Optional default [ambient effects](ambient-effects.md) (Areable only, at most 8): each an effect without its `id`; placing the template copies them onto the instance with new IDs ([D24](../../decisions.md#d24-ambient-effects)) |

Node-level fields (`NodeRule`): `pin` (`x`/`y`/`z`: `start`/`center`/`end`), `stretch` (`x`/`y`/`z`: boolean), `repeat` (`offsetMm` `{x,y,z}`, each a number or formula, and `count`: `{ parameter, factor?, add? }` giving `floor(value × factor + add)`, a whole number, a formula (floored), or `"fill"`), `follows` and `extendsWith` (name of a counted repeat node), `emitter: "linear"`, and the [Phase 9 rules](#parametric-part-rules) `size`, `visible`, `rotate`, `translate`, and `face`.

### Parameters

Width, height, and depth parameters come from the per-axis resize modes: every axis with a size parameter (`scale` or `slice`, unless `parameter` is `null`) becomes a `Length` parameter with the axis limits, default, `description`, and `quickPicks`; `fixed` and `fitHostDepth` axes have none. An axis can name its parameter, for example a staircase's `totalRiseMm`. Any other editable parameter (for example a staircase's `stepCount`) is declared in `homeplan.properties` as a JSON Schema fragment with `x-homeplan` editor annotations, the same format as built-in types ([property system](../property-system.md)). The property panel shows them without template-specific code ([D26](../../decisions.md#d26-self-describing-parametric-templates)).

A fragment is one of four kinds, each with a `default` of its type; the standard `description` keyword is its help text:

| Kind | Schema | Formula type |
| --- | --- | --- |
| Length or number | `type: "number"` or `"integer"`, optional `minimum`/`maximum`; `x-homeplan.quickPicks` lists suggested values inside the limits | number |
| On/off | `type: "boolean"` | boolean |
| Choice | `type: "string"` with `enum` (or `anyOf` of `const` strings); the default is one of the choices | string |

`x-homeplan.state: true` marks a parameter as live state (an open angle, blinds closed): the panel groups it as **State** and Home Assistant bindings target it (Phase 9.7).

**In the property panel** (Phase 9.1, generated by `templateParameterSchema` and `withTemplateParameters`, no template-specific code) a placed object shows its parameters in three groups: **Size** (the axis size parameters), **Settings** (the other `properties`), and **State** (those marked `state`). The control follows the fragment: a length (`x-homeplan.editor: "length"` or `quantity: "length"`) or an axis size is a length field, an angle an angle field, any other number or integer a number field (integers accept whole numbers only); `quickPicks` add a row of chips under the field, one click commits the value (lengths in the project unit); a boolean is an on/off switch; a choice is a segmented control for two or three choices and a dropdown for more, unless the fragment names its `editor`. Choice labels are the `anyOf` `title`s; a bare `enum` value is shown capitalised with its words split (`tiltTop` → "Tilt top"). `description` is shown under the field. Every change is one undoable command and redraws only that object. Parameter and formula names may not be `sizeX`, `sizeY`, `sizeZ`, `hostDepthMm`, `true`, `false`, or a function name.

```json
{
  "properties": {
    "openAngleDeg": { "type": "number", "title": "Open", "minimum": 0, "maximum": 90, "default": 0,
                      "description": "How far the leaf is open.", "x-homeplan": { "editor": "angle", "state": true } },
    "blindsClosed": { "type": "boolean", "title": "Blinds closed", "default": false, "x-homeplan": { "editor": "toggle", "state": true } },
    "panelStyle":   { "type": "string", "title": "Panel", "enum": ["flat", "glazed"], "default": "flat", "x-homeplan": { "editor": "select" } },
    "drawer":       { "type": "boolean", "title": "Drawer", "default": true, "x-homeplan": { "editor": "toggle" } }
  }
}
```

### Formulas

A rule field that takes a number or a boolean also takes a **formula**: a text expression parsed once and evaluated by `shared/domain/templates/formula.ts` (no `eval`; [D26](../../decisions.md#d26-self-describing-parametric-templates)). At most 500 characters.

- **Values:** numbers (`12`, `0.5`, `.5`, `1e3`), `true`/`false`, and quoted text (`'glazed'`, only to compare a choice parameter with `==` or `!=`).
- **Operators**, lowest precedence first: `c ? a : b`; `||`; `&&`; `==` `!=`; `<` `<=` `>` `>=`; `+` `-`; `*` `/` `%`; unary `-` and `!`; parentheses. Arithmetic and order comparisons take numbers, `&&` `||` `!` and the condition of `?:` take booleans, `==`/`!=` compare two values of one type, and both branches of `?:` have one type.
- **Functions** (numbers only): `min(a, …)`, `max(a, …)`, `floor(x)`, `ceil(x)`, `round(x)`, `abs(x)`, `clamp(x, lo, hi)`. `floor` and `ceil` allow 10⁻⁹ of rounding error, so `floor(1650 / 50)` is 33.
- **Names:** every declared parameter (its resolved value: the instance's, else the default), every named formula in `formulas`, `sizeX`/`sizeY`/`sizeZ` (the requested size of each axis in mm: its size parameter's value; for `fitHostDepth` the host depth plus the bands; otherwise the authored size), and `hostDepthMm` (the host wall's depth, 0 without one).
- **Named formulas** may read each other; they are evaluated in dependency order and a cycle is an error.
- **Checked** at import, Object Editor save, and build: syntax, unknown names and functions, argument counts, types (each field's expected type), choice texts that are not choices, and cycles. At run time a formula that fails (for example a division by zero) is a resize issue and the instance falls back to its placeholder.

```json
{
  "formulas": { "ribCount": "floor(widthMm / 50)", "slatAngleDeg": "blindsClosed ? 80 : 0" }
}
```

### Parametric part rules

Phase 9 adds five node rules. `size` is a shape rule; `visible`, `rotate`, and `translate` are **pose** rules: they never change the object's size, bounds, opening, wall position, or contact, so opening a door or hiding an option never moves the object.

| Rule | Value | Behavior |
| --- | --- | --- |
| `size` | `{ x?, y?, z? }`: mm, number or formula | Sets the part's extent on each named axis by scaling it about its own centre, after pin/stretch (picture inset inside a mat, a cushion sized to its seat) |
| `visible` | boolean or boolean formula | `false` drops the part (all its copies) from the output |
| `rotate` | `{ axis, angleDeg, pivot?, perCopy? }` | Turns the part by `angleDeg` (number or formula) about a line parallel to `axis` (`x`, `y`, `z`) through the pivot. Positive angles follow the right-hand rule (counter-clockwise looking from the positive end of the axis): about `y`, a leaf hinged on its left (x start) edge swings toward the front (+z) with a **negative** angle |
| `translate` | `{ x?, y?, z? }`: mm, number or formula | Moves the part in template axes after it is rotated (a sliding leaf) |
| `face` | `"interior"` | When the instance flips in z, the part is not mirrored and stays on the template front (+z, the room side): a blind inside a window flipped inside/outside |

**Pivot.** `pivot` gives, per axis, `"start"`, `"center"` (default), or `"end"` of the part's own resized bounds, or `{ at?, of?, offsetMm? }` with `of: "template"` for the object's bounds and an offset (mm, number or formula). Without `perCopy` all copies of a repeated node turn together about the pivot of their union; with `perCopy: true` each copy turns about its own pivot (blind slats about their own centre).

**Order.** Per instance: counted repeats and their growth → axis maps → `pin`/`stretch` (or slices) → `size` → `fill` copies → layout (bounds, opening, wall position, contact) → `visible` → `rotate` → `translate` → flips (x, then z except `face: "interior"` parts) → contact frame. Formulas are evaluated once per instance; they cannot read the copy index. **Pose blend** (Phase 10.2, animated state changes): `templateResize` may take `pose`, weighted parameter sets for the pose rules only; each `rotate` angle, pivot offset, and `translate` is then the weighted mean of its value under every set, and a `visible` part is shown when the sets showing it weigh at least half. The layout always comes from the instance's own parameters ([HA bindings: animated state changes](../../home-assistant/bindings.md#state-parameters)).

**Counted repeats by formula.** A count formula is floored; offsets may be formulas. The asset is authored with one copy at the defaults, the parts that span the default run (a radiator's header pipe) `extendsWith` the repeat, and parts beyond the run `follows` it, exactly as for stairs; growth is `count × offset − defaultCount × defaultOffset`. At most 1000 copies.

A ribbed radiator (ribs 50 mm apart; 1650 mm gives 33 ribs, 400 mm gives 8):

```json
{ "homeplan": { "repeat": { "offsetMm": { "x": 50 }, "count": "floor(widthMm / 50)" } } }
```

Blind slats tilting about their own long axis, staying on the room face:

```json
{ "homeplan": {
    "stretch": { "x": true },
    "repeat": { "offsetMm": { "y": 30 }, "count": "floor((heightMm - 60) / 30)" },
    "rotate": { "axis": "x", "angleDeg": "blindsClosed ? 80 : 0", "perCopy": true },
    "face": "interior" } }
```

A sash hinged on its left edge at the room face (flip x moves the hinge to the other side):

```json
{ "homeplan": {
    "stretch": { "y": true },
    "pin": { "x": "start" },
    "rotate": { "axis": "y", "angleDeg": "openMode == 'swing' ? -openAngleDeg : 0", "pivot": { "x": "start", "z": "end" } } } }
```

A sliding leaf:

```json
{ "homeplan": { "pin": { "x": "end" }, "translate": { "x": "-openPct / 100 * (widthMm / 2)" } } }
```

A drawer shown by an option:

```json
{ "homeplan": { "stretch": { "x": true }, "visible": "drawer && widthMm >= 600" } }
```

The dev-only fixture `rules-playground` (`scripts/templates/playground.ts`, shown at `/ds/viewport` → **Template preview**) uses each of these rules.

### Direction

- **Axes are glTF's:** +Y is up and +Z is front. The front faces the room that owns the object: a window or door faces into its host wall's area, and a wall-mounted `Areable` touches its wall with its back (−Z). Floor objects stand on their bottom (−Y); overhead fixtures hang from their top (+Y) at the [virtual overhead reference](lighting.md#ownership-fixtures-and-emitters).
- **Contact:** `attachment.contact` names a bounding-box face (`back`, `bottom`, `top`) or an **anchor node**. An anchor node is an empty glTF node placed where the object touches its host; Blender empties export as such nodes.
- **Flip:** `flip` declares which mirrors an instance may apply. `x` mirrors left and right, such as a door's hinge side. `z` mirrors front and back, such as a door swinging in or out.

### Resizing per axis

| Mode | Behavior |
| --- | --- |
| `fixed` | Natural size only |
| `scale` | The whole axis stretches between `minMm` and `maxMm` |
| `slice` | The `startMm` and `endMm` bands keep their size; only the middle band stretches. This is the 3D form of 9-slicing: slicing all three axes gives 27 regions |
| `fitHostDepth` | Depth axis of a `Wallable` only: the middle depth band stretches to the host wall's effective depth, as for a door lining |

A `Wallable` with `fixed` depth uses `wallPosition` (`interior`, `center`, or `exterior`, plus an optional offset) to sit within the wall. The rest of the opening shows reveals in the house cap material ([D05](../../decisions.md#d05-walls-between-adjacent-areas)).

The geometry core applies slicing to vertices, so it does not depend on the source format; converted STL models can be sliced too. Parameters are validated against the limits, and a size below `startMm + endMm` is rejected. A `fitHostDepth` axis's bands are the parts outside the wall, such as handles, so the resized depth is the host depth plus both bands. A slice band bound to a parameter (`startParameter`/`endParameter`) scales to that parameter's value; an L-shaped staircase uses this for its width, which appears on both plan axes.

### Part rules and stacking

A node with a `pin`, `stretch`, or `repeat` rule is not deformed by the axis slices; nodes without one follow the slices vertex by vertex. Per axis, a ruled node is stretched when `stretch` names the axis (its extent is mapped through the axis, which scales it with the middle band), otherwise it moves rigidly: to keep its distance from the pinned side (`start`, `center`, `end`), or, when unpinned, to where its center maps.

| Rule | Behavior | Example |
| --- | --- | --- |
| `pin` (`start`, `center`, or `end`, per axis) | Keeps its size and stays at that side or the center | A center mullion stays thin and centered; a handle stays at its height |
| `stretch` (per axis) | Scales with the available middle size | A glass pane |
| `repeat` | Copies the node at a fixed offset; the count comes from the available size or from a parameter | Glazing bars, shelves, stair steps |

Illustrative stair step stacking (node `extras`):

```json
{
  "homeplan": {
    "repeat": {
      "offsetMm": { "y": 175, "z": 280 },
      "count": { "parameter": "stepCount" }
    }
  }
}
```

Each copy sits one riser higher and one tread further than the previous one. [Staircase templates](staircase-areas.md) use this for their steps.

The asset is authored at the parameter defaults with one copy of the repeated node. A counted repeat whose count differs from its default grows the asset by `(count − default) × offset`: nodes that name it in `follows` move by that growth (a landing, the next flight) and nodes that name it in `extendsWith` lengthen by it (stringers). The axis resize then maps from the grown size, so `totalRiseMm` with `stepCount` steps gives each riser `totalRiseMm / stepCount`. A `fill` repeat copies the resized node at its offset across the remaining middle band.

The engine returns geometry in a contact frame: x centered; for a `Wallable` y = 0 at the opening bottom and z = 0 at the wall's center plane (+z toward the host side); otherwise the contact face or anchor node at the origin. Flips mirror x about the center and z about the wall center (Wallable) or the object center, reversing triangle winding for one mirror.

### Openings

A `Wallable` declares its opening. In MVP the opening is the rectangle of the resized object's width and height plus optional clearance, cut through the full wall depth ([shared-wall openings](shared-walls.md#openings-and-host-depth)). Non-rectangular openings, such as arches, are post-MVP. The opening is regenerated whenever the instance's size or position changes.

### Material slots and textures

A slot maps to a glTF material by name. An instance can override a slot with its own surface material ([D19](../../decisions.md#d19-materials)): an [image texture](house-images.md), tint, shininess, and placement, or (choosable slots, Phase 9.1) one of the template's bundled presets, stored as `{ "preset": "<glTF material name>" }`. Authored UVs in a stretched band stretch with it. Surface materials applied as overrides use a box projection at physical size, computed after resizing, so textures do not smear.

### Material choices

A slot written as an object says how the property panel offers it (Phase 9.1): `title` (the panel label), `choosable` (the slot is offered for choice), `presets` (names of other glTF materials in the same asset: finishes shipped with the template, such as oak, wenge, white), `allowColor` (a plain colour), and `allowTexture` (the house's own texture). The choice is stored as the instance's material override ([D19](../../decisions.md#d19-materials)). The string form stays valid and means a slot with no offered choices.

As built (Phase 9.1): every choosable slot is one field in the placed object's **Materials** group (`materialChoice` editor, `MaterialChoicePropEditor`). It shows swatches (the glTF base colour; a textured finish shows fine lines over it): the slot's own material first, then its other presets in order, then **Own colour** (`allowColor`) and **Own texture** (`allowTexture`) as a colour wheel. The stored override (`materialOverrides.<slot>`):

| Choice | Stored |
| --- | --- |
| The slot's own material | no entry (the override is removed) |
| Another preset | `{ "preset": "Wenge" }`: drawn with that bundled glTF material and its authored UVs; a name the asset no longer has falls back to the slot's material |
| Own colour / texture | a full surface material, edited by the colour, Shininess, Metallic (and for a texture the image and placement) fields under the swatches; box-projected at physical size |

Existing overrides (always surface materials) stay valid. Slots that are not choosable show no field, as before. The renderer loads every glTF material of the asset, including presets no mesh uses (`src/renderer/templateCache.ts`). In the Object Editor, a house template's **Picker** group lists each slot with **Panel label**, **Offered for choice**, **Presets** (from the asset's materials), **Allow an own colour**, and **Allow an own texture**.

```json
{
  "materialSlots": {
    "frame": "Frame",
    "leaf": { "material": "Oak", "title": "Door leaf", "choosable": true, "presets": ["Oak", "Wenge", "White"], "allowColor": true, "allowTexture": true }
  }
}
```

### Mirrors

`"mirror": { "materialSlot": "glass" }` marks a slot as a mirror surface; the slot must be declared. The editor and the HA viewer draw it with an environment-map reflection (Phase 9.1, owner: cheap shine; real reflections later). As built (`src/renderer/mirrorSurface.ts`): the slot's meshes get a shiny copy of their material (metallic 1, roughness 0.04, a quarter of the authored colour as tint) whose environment map is the view's own (the HA viewer's scene environment) or, in the builder and the template preview, one small PMREM of a neutral room generated on first use. One environment and one copy per material are shared by every mirror, so a mirror costs no more than any other material and nothing is rendered per frame. The reflection dims with the sky: its strength is `Lighting.reflectionScale()` (1 in full daylight, the sky fill's share at night, about 0.006), so mirrors stay dark at night instead of glowing under the night exposure (owner, 2026-11-17; implementation convention). An instance that overrides the slot with its own surface material draws that material instead. In the Object Editor, **Mirror material** (General) sets it like **Screen material**.

### Screens

A display template (a TV) names its screen with `"screen": { "materialSlot": "screen" }` in the scene's `extras.homeplan`; the slot must be one of its `materialSlots` (Phase 8.8, owner K17). The builder draws the screen as authored (a dark glossy material). The [HA viewer](../../home-assistant/bindings.md#tv-screens) shows a bound `media_player`'s running app on it: an unlit picture plane just in front of the slot's box (after resizing) on the template front (+z; −z when the instance is flipped in z), fitted inside it (contain, 94 % at most), so the screen's own geometry and UVs do not matter (`src/renderer/screenLayer.ts`, `InstanceLayer.screen`). A screen should therefore be a flat part facing the template front. In the Object Editor, a house template gets one with **Screen material** (General): the slot name or the glTF material name of the screen (a material name is stored as the slot that maps to it; empty removes the screen). The built-in `tv-wall` declares its `screen` slot.

### Linear emitters

`KHR_lights_punctual` has no area or linear lights. A linear fixture marks its strip node with `"emitter": "linear"` in the node's `extras.homeplan`; the [lighting](lighting.md#linear-lighting) adapter turns it into the preview emitter. Point and spot emitters use `KHR_lights_punctual`.

### Validation

- Node names referenced by metadata must be unique within the asset.
- Reported on import: missing referenced nodes, slice bands larger than the minimum size, unsupported required extensions, and missing UVs.
- Also checked (Phase 9): property fragments (kind, default type and range, choices, quick picks, `x-homeplan` shape), reserved names, every formula ([formulas](#formulas)), preset materials that do not exist, `perCopy` on a part that does not repeat, and a `mirror` naming an undeclared slot.
- Also checked: undeclared parameters (repeat counts, band parameters), default `effects` on a contract other than Areable, `follows`/`extendsWith` targets that are not counted repeats or that form cycles, an axis both pinned and stretched, `fitHostDepth` or `wallPosition` outside a Wallable's z axis, defaults outside the limits, a missing opening on a Wallable or an opening on any other contract, material slots naming missing materials, and a `screen` naming an undeclared slot.
- Also checked (Phase 19.3): a `roof` host or `roofWindow` limits only together on a Wallable, the lowest pitch not above the highest, and a roof window sizing x by `widthMm` and y by `heightMm`.
- A template advertises only the resize modes and parameters it declares.

### Roof windows

Phase 19.3 ([roofs](roofs.md#holes-and-roof-windows)). A roof window is a **Wallable hosted by a roof face** (`attachment.hosts: ["roof"]`, kind `roofWindow`, D17 glTF like every template): its template frame has x level across the slope, y up the slope from the window's lower edge, z through the roof (+z out, toward the sky). Its z axis is `fitHostDepth`: the middle band is the lining through the slab, fitted to the roof's thickness across the slope (`thicknessMm / √(1 + slope²)`); the end band is the frame and glass above the roof's top. It sizes x by `widthMm` and y by `heightMm` (the placed window's Width and Length), and declares `roofWindow` pitch limits, copied into the placed window (`minPitchDeg`, `maxPitchDeg`) so the no-fit rules read the house alone. Only the roof-window picker offers these templates (the window picker leaves them out); the placed window is stored on the roof sheet, not as a wall or area instance.

## Built-in catalog

Built-ins are generated by `scripts/build-templates.ts` (`npm run templates:build`) into `server/builtin-templates/<id>/` as `v1.glb`, `template.json`, and a 256 × 256 `thumbnail.svg` elevation or plan. Each family is a module under `scripts/templates/` (`openings`, `seating`, `tables`, `beds`, `electronics`, `decor`, `plants`, `appliances`, `bathroom`, `lights`, `stairs`, `storage`, `kitchen`, `heating`, `outdoor`, `fences`, `roofWindows`) exporting `templates`, listed in `scripts/templates/index.ts`, with shared geometry, writers, checks, and thumbnails in `scripts/templates/helpers.ts`; `npm run templates:build -- --only <family>[,<family>]` builds only those families' folders. The dev-only `playground` family writes `src/features/viewport/fixtures/rules-playground.glb` instead. Sizes are millimeters; "slice a–b" gives the parameter range.

| ID | Contract, host, contact | Resize and parameters | Notes |
| --- | --- | --- | --- |
| `window-style-1` | Wallable, wall, back | x slice 400–3000 (1200), y slice 400–2400 (1000), 60 mm bands; z fixed 80, center | Pinned center mullion, stretched glass; flip x; `bottomMm` 900 |
| `window-fixed-wide` | Wallable, wall, back | x slice 600–4000 (2000), y slice 400–2400 (1200), 50 mm bands | Picture window; `bottomMm` 600 |
| `door-interior` | Wallable, wall, back | x slice 700–1200 (850), y slice 1900–2400 (2050); z `fitHostDepth` | Lining fills the wall; leaf, handles, and hinges pinned; flips x and z; `bottomMm` 0 |
| `door-entrance` | Wallable, wall, back | x slice 900–1400 (1000), y slice 2000–2400 (2100); z `fitHostDepth` | Threshold, vision panel, pull bar; flips x and z |
| `sofa-3-seat` | Areable, floor, bottom | x slice 1800–3000 (2200), 200 mm arms | Cushions widen with the seat |
| `armchair` | Areable, floor, bottom | fixed | |
| `dining-table` | Areable, floor, bottom | x slice 1000–2800 (1600), z slice 700–1200 (900) | Legs stay in the corner bands |
| `bed-double` | Areable, floor, bottom | x slice 1300–2100 (1700), z slice 2000–2400 (2130) | Headboard at the back |
| `tv-wall` | Areable, wall, back | x slice 700–2000 (1230), y slice 400–1200 (710) | `elevationMm` 1000; `screen` slot (Phase 8.8) |
| `picture-frame` | Areable, wall, back | x and y slice 200–1800 (600 × 800) | `picture` slot for an image |
| `air-conditioner` | Areable, wall, back | fixed | `topInsetMm` 150, no opening; blue swirl blown forward (D24) |
| `water-heater` | Areable, wall, back | fixed | Wall tank 450 × 850, `elevationMm` 1100; red swirl rising above (D24) |
| `pendant-light` | Areable, overhead, top | y slice "Drop" 450–2500 (1000) | Cord stretches; emissive shade; point light 800 lm, 2700 K |
| `floor-lamp` | Areable, floor, bottom | fixed | Point light 1200 lm |
| `linear-strip` | Areable, wall/overhead/floor, back | x slice "Length" 200–6000 (1000) | Diffuser node `emitter: "linear"`, 1200 lm |
| `staircase-straight` | Staircasable, floor, bottom | `widthMm` slice 600–2000 (1000), `totalRiseMm` scale 1000–6000 (2700), `depthMm` "Run" scale 1000–8000 (2800), `stepCount` 3–30 (15) | Repeated tread, stringers `extendsWith` the step; the goings stretch with the run |
| `staircase-l` | Staircasable, floor, bottom | `widthMm` and `depthMm` slice 1500–6000 (2860), flight width band `flightWidthMm` 600–2000 (900), `totalRiseMm` 1000–6000, `stepCount` | Lower flight ⌊n/2⌋, landing, upper flight ⌊(n−1)/2⌋ |
| `floor-opening` | Areable, floor, bottom; `floorCut` rectangle | `widthMm`, `depthMm` scale 200–8000 (1000) | Kind `floorOpening`; 30 × 15 mm edge trim inside the outline |
| `floor-opening-round` | Areable, floor, bottom; `floorCut` ellipse | `widthMm`, `depthMm` scale 200–8000 (1000) | Kind `floorOpening`; round edge trim |
| `tree-deciduous`, `tree-conifer`, `tree-birch`, `tree-olive`, `tree-ornamental` | Areable, floor, bottom; category Garden, kind `plant` (Phase 17.3, `outdoor.ts`) | y scale "Height" (6000 / 7000 / 8000 / 4000 / 3000 mm), property `canopyMm` "Canopy width" (or "Spread"; 4800 / 3200 / 3200 / 3800 / 3200) | Low-poly: seeded faceted canopy blobs (80 triangles each) or jagged tiers on a tapered trunk; the canopy widens and spreads about the trunk with `canopyMm` (`size` + `translate` per part), the trunk thickens with the height; canopy slot with season or colour presets; a hidden footprint centres the bounds on the trunk; 260–1000 triangles |
| `shrub-round`, `shrub-flowering` | Areable, floor, bottom; Garden, `plant` | y scale "Height" 1000 / 1300, `canopyMm` "Width" 1300 / 1600 | Blob clusters; the flowering shrub has a Flowers slot (pink, white, purple, yellow) |
| `planter-garden` | Areable, floor, bottom; Garden, kind `planter` | x slice "Length" 400–4000 (1200), 40 mm end walls | Box planter (corten, concrete, anthracite, cedar) with soil and a row of low shrubs |
| `wall-lantern`, `wall-up-down`, `bulkhead-light` | Areable, wall, back, `defaultHostSide: "exterior"`; Lighting, kind `light` (Phase 17.3) | fixed | Outdoor wall lights with a `KHR_lights_punctual` bulb in front of the wall (600 / 700 / 800 lm); see [wall-mounted lights](lighting.md#wall-mounted-lights-phase-173) |
| `fence-picket`, `fence-panel`, `fence-hedge` | Areable, floor, bottom; kind `fence` | `widthMm` scale 50–100 000 (2100, 2000, 2000), `heightMm` scale (1000, 1200, 1300) | Phase 17.2 [yard fences](yards.md#fence-and-gate-templates): never placed by a picker; units counted by formula from width; dependent rails `extendsWith` them, end posts `follows` them, every part stretched. Hedge v1 rebuilt with uneven volume, small folded leaves in three tones, and stems (owner appearance fix, 2026-11-18) |
| `fence-slatted`, `fence-trellis`, `fence-wire` | Areable, floor, bottom; kind `fence` | x scale 50–100 000 (2000); y scale 600–2500 (1700), 600–2400 (1600), 500–2500 (1300) | Additional [yard fence styles](yards.md#fence-and-gate-templates): timber privacy slats, framed diamond trellis, welded wire mesh. Two-metre panels repeat per finish, end posts follow; finishes/materials are template-owned |
| `gate-picket`, `gate-panel` | Wallable, kind `gate` | x and y scale 600–4000 × 600–2500 (1000 × 1000, 1200 × 1200), z fixed centre | Offered only by the Gate picker on a yard's fences |
| `roof-window` | Wallable, roof, kind `roofWindow`, category Windows; `roofWindow` 15–90° (Phase 19.3, `roofWindows.ts`) | x slice 450–1400 (780), y slice 600–1800 (1180), 70 mm bands; z `fitHostDepth` + 90 mm end band | Centre-pivot roof window: pale timber lining through the roof, anthracite frame and glass above it |
| `skylight-flat` | Wallable, roof, kind `roofWindow`, category Windows; `roofWindow` 0–15° | x and y slice 500–2400 (1000), 90 mm bands; z `fitHostDepth` + 250 mm end band | Fixed skylight on a white 230 mm curb for flat and low roofs |

**Venetian blinds** of the parametric openings (`window-casement`, `door-glazed`, `balcony-door-double`, `sliding-door-double`; `scripts/templates/openings.ts`), implementation conventions revised in Phase 15.5 (owner, 2026-11-18: no sun came through the windows). The slats are 25 mm deep and 0.6 mm thick (before: 2.5 mm) at a 22 mm pitch, 8 mm wider than the glass on each side, and the lowest slat may hang up to 10 mm below the glass. Level slats (`blindsClosed` off) let through 1 − (0.6 + 25 · tan p) / 22 of the direct sun at a profile angle p: 0.39 at 27°, none above 40°. Closed slats turn 80° with their room-side edge up (`slatAngleDeg` is `blindsClosed ? -80 : 0`; before, +80° left channels along the slats that passed 15 % of the sun at a 61° profile angle). `npm run windows:sun [-- <houseId>] [--north <deg>]` (`scripts/check-window-sun.ts`) resizes and places every wall opening of a house as the renderer does and casts sun rays through its glass. It runs with the sun as it is now and with the sun straight onto the opening at the same elevation, with no blind, open slats, and closed slats, and reports the share that passes, both exact and point-sampled at the sun shadow map's texel size. Only the house data is read.

## Template versus placed instance

- **Template:** a glTF asset plus its Homeplan metadata, versioned.
- **Instance:** one placed object with its own stable ID, the template ID and version, parameters, flips, material overrides, and placement.

One template can have many instances. Editing an instance never changes the template or other instances. A template's default placement applies only when an instance is inserted.

`Areable` instances live in their area's object collection, including wall-mounted ones, which reference their attachment wall. `Wallable` instances live under their host wall. Illustrative instance in `house.json`:

```json
{
  "id": "window-1",
  "templateId": "window-style-1",
  "templateVersion": 1,
  "placement": { "distanceAlongWallMm": 1000, "bottomMm": 900 },
  "parameters": { "widthMm": 1200, "heightMm": 1000 },
  "flip": { "x": false, "z": false },
  "materialOverrides": {
    "frame": { "pbrMetallicRoughness": { "baseColorFactor": [1, 1, 1, 1], "roughnessFactor": 0.7, "metallicFactor": 0 } }
  }
}
```

A material override is a full surface material, as on any other surface; choosing a preset copies its values here ([D19](../../decisions.md#d19-materials)).

## Templates in the builder

As built (Phase 1–2; picker and names updated in Phase 7.8). In the UI, templates are called **objects** (owner, 2026-11-16); "object template" stays the domain term in the spec and code.

- **Picking:** the tree's Add items open one picker popup (`size="xl"`: 80rem × 85% of the window, the grid scrolling inside) listing built-in and house templates with their thumbnails: **Add a door** (Wallable, kind `door`), **Add a window** (other Wallables), **Add an object** (Areables, floor openings excepted), **Add a staircase** (Staircasables), **Add a floor opening** (Areables of kind `floorOpening`), and **Choose a light fixture** (kind `light`). Each picker shows only the contract and kind it needs (`pickerFilter.ts`). A **search field** is focused on open: every word typed must appear in the label or kind (case-insensitive), and **Enter places the first match**. When the house has its own templates, **All / Built-in / This house** buttons filter by source, and a count shows "n of m". **Categories** (Phase 9.1): when the listed templates declare more than one category, a row of chips filters by category, **All** first (the default), then each declared category alphabetically and **Other** (templates without a category) last, each with the number of templates matching the current search and source; under All the grid is grouped under category headings in the same order, and Enter places the first object shown. No category list is built into the app. The search also matches the category, tags, and the product manufacturer, name, code, and description; a tile shows the product's manufacturer and name when declared. Kind chips stay left out: most templates have kind `object`. The template list (`GET /api/houses/:houseId/templates`) carries each template's `category`, `tags`, and `product` when declared (built-ins through `template.json`, house templates from their metadata).
- **Object Editor (Phase 9.1):** a house template's metadata panel adds **Mirror material** (General); a **Picker** group with Category, Tags (comma-separated), one group per material slot (choice settings), and the named formulas (editable; added in the asset); and a **Product** group (manufacturer, name, code, link, description, notes). A node's part rules add **Parametric rules (formulas)**: Visible (true, false, or a formula), Rotate about / angle (degrees or formula), the pivot (shown; authored in the asset), per-copy rotation, Move X/Y/Z and Size X/Y/Z (mm or formula), and Keeps to the room face. Every formula is checked by the formula validator as it is typed in; the message shows under its field (and in the banner) and the version cannot be saved until it is fixed.
- **Version field:** the instance's **Template** field shows "<label> · v<n>" and, when a newer version exists, an **Update to v<latest>** button that adopts it in one undoable command ([D07](../../decisions.md#d07-template-library-and-updates)). On a light it also offers **Choose fixture…** / **Change…** and **Remove** (an invisible source has no fixture).
- **House library:** the house properties' **Objects (n)** group lists the house templates as "<label> · v<latest>" with an Edit button that opens the [Object Editor](../screens/object-editor.md), and **Import model…** opens it for a new import.

Post-MVP [controllable declarations](../../home-assistant/controllables.md) would be added to the template metadata.

## Verification scenarios

- A built-in sliced window resized from 1200 to 2000 mm keeps its 60 mm frame, widens its glass, and updates its wall opening.
- A pinned center mullion stays centered and keeps its width when the window widens.
- A door with `fitHostDepth` fills a 100 mm and a 400 mm wall; flipping `x` and `z` changes hinge side and swing.
- A stair step with a `repeat` rule produces the requested step count at the declared riser and tread offset.
- An air conditioner is `Areable` with a wall attachment, keeps its body depth when the wall thickness changes, and creates no opening.
- A GLB authored in Blender with custom properties imports with its metadata pre-filled.
- An STL imports after the unit and orientation are confirmed and can then be sliced like any GLB.
- Every saved template version opens in an ordinary glTF viewer and passes the glTF Validator.
- One template can be placed several times with independent instance IDs; template and instance IDs survive save and reload.
