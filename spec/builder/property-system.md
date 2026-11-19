# Property schemas and the property panel

Updated: 2026-11-16.

Status: resolved ([D18](../decisions.md#d18-property-schemas-and-the-property-panel)). Owner requirements:
- Every object type has its own property schema and metadata.
- The metadata says each property's type, whether it is editable, and which editor edits it.
- The property panel is a dynamic form generated from that metadata.
- Every editor is documented in `/ds`.
- Edits are live, with Undo and no panel-wide Cancel.

The open-standard choice, the annotation names, and the editor list are review inference. Implemented: schemas in `shared/domain/schemas/` (annotation vocabulary in `annotations.ts`, group catalog in `propertyGroups.ts`), the form builder and panel in `src/design-system/forms/`, generic editors in `src/design-system/property-editors/`, and the selection-to-schema mapping in `src/features/floor-builder/services/selectionSchema.ts`. The JSON examples below are abridged from the emitted schemas.

## One schema per object type

The per-type properties and their metadata are collected in [object models](object-models.md) (owner-approved).

Each object type (a "class") has one property schema written in **JSON Schema** (draft 2020-12), the open standard for describing and validating JSON. [JSON Schema](https://json-schema.org/specification). The same schema serves three purposes:

1. **Generating the property panel** for objects of that type.
2. **Validating edits** before they become commands.
3. **Validating saved documents** on the server; the `house.json` schema is composed from the type schemas.

So there is one definition per type, not separate UI, client, and server versions.

| Object type | Schema source |
| --- | --- |
| House, Building floor, Area, Floor shape group, Shape (rectangle, circle, polygon), Wall, Wall feature, Carpet, Object group, Light, Light group, Guide | Built-in schemas in `shared/domain/schemas/` |
| Roof (Phase 19; replaced the Phase 2 roof cut), Staircase (Phase 2) | Built-in schemas, added with their phase |
| Template instance (door, window, object, fixture, staircase) | The base instance schema (placement, flips, material overrides) combined with `allOf` and the parameters declared in the template's [glTF metadata](features/object-templates.md#homeplan-metadata) |

Templates therefore declare their own editable parameters, such as `stepCount`, in the same format as built-in types. The panel picks the schema from the selected entity's kind in the [entity index](model.md#document-tree-ids-and-the-entity-index) (`schemaForEntity`); a shape uses the schema of its own type.

## Metadata: standard keywords first

Most of what the panel needs is already a standard JSON Schema keyword:

| Need | Keyword |
| --- | --- |
| Value type | `type` (`string`, `number`, `integer`, `boolean`, `object`) |
| Label and help text | `title`, `description` |
| Default | `default` |
| Limits | `minimum`, `maximum`, `exclusiveMinimum`, `minLength`, `maxLength`, `pattern` |
| Choices with labels | `anyOf` with `const` + `title` per choice (emitted by the `Choice` helper; `oneOf` and plain `enum` are also read) |
| Not editable | `readOnly: true` (shown, not editable) |

What JSON Schema doesn't cover sits in one annotation keyword, `x-homeplan`:

| `x-homeplan` field | Meaning |
| --- | --- |
| `editor` | Which property editor edits it (see below). If omitted, a default is chosen from the type |
| `quantity` | Physical quantity: `length` (stored in mm), `angle` (degrees), `luminousFlux` (lm), `colorTemperature` (K) |
| `group`, `order` | Panel group (a [catalog](#property-groups) ID) and position |
| `groups` | On a type's root: the groups it declares, built with `propertyGroups(...)` |
| `hidden` | Not shown at all (IDs, source-edge references, child lists) |
| `visibleWhen` | `{ property, equals }`: show only when a sibling property has that value, e.g. Kelvin only when the color mode is `colorTemperature` |
| `derived` | A read-only value computed by the domain and never persisted, such as floor area |
| `state` | Template parameters ([D26](../decisions.md#d26-self-describing-parametric-templates)): the value is live state (an open angle, blinds closed), grouped as **State** and the target of Home Assistant bindings |
| `quickPicks` | Template length/number/angle parameters: suggested values shown as a chip row under the field (`QuickPicks`, Phase 9.1), one click commits, e.g. standard bed widths |
| `materialChoice` | Generated for a template's choosable material slot (Phase 9.1): `{ material, presets: [{ name, color, textured }], allowColor, allowTexture }`, read by the `materialChoice` editor ([material choices](features/object-templates.md#material-choices)) |
| `options` | For editors whose choices come from data, such as `materialPresets` or `templateVersions` |
| `inlineLabel` | A 1–3 character label inside a length field ("W"); two consecutive ones share one row (Phase 5.8) |
| `optionIcons` | Icon names per choice value for a segmented control (Phase 5.9) |
| `unitSuffix`, `step` | A number's suffix (lm, K, °) and step |
| `inverted`, `invertedTitle` | A slider that shows `max + min − value` (Shininess for roughness) |
| `searchable`, `placeholder` | A searchable select (time zones); placeholder text |
| `referenceKind`, `multiple` | What a `reference` editor picks (`wall`, `light`, `object`) and whether it picks several |
| `accept`, `maxBytes` | A `file` editor's accepted types and size limit |
| `title`, `submitLabel`, `cancelLabel`, `description`, `size` | On a popup form's root: its title, buttons, help text, and size (`sm`, `md`, `lg`) |

Annotations are read through `readAnnotation`, which validates them against this vocabulary; an invalid annotation is ignored. TypeBox helpers in `values.ts` (`Length`, `Angle`, `Vector2Length`, `Choice`, `Name`, `ColorRgb`, `SurfaceMaterial`) set the editor, quantity, group, and order, so type schemas rarely spell `x-homeplan` out (implementation convention).

Wall schema (abridged; `spanMm` omitted):

```json
{
  "type": "object",
  "title": "Wall",
  "x-homeplan": {
    "groups": [
      { "id": "placement", "title": "Placement" },
      { "id": "size", "title": "Size" },
      { "id": "appearance", "title": "Appearance" }
    ]
  },
  "properties": {
    "id": { "type": "string", "pattern": "^[a-z]+_[a-z0-9]{6,}$", "readOnly": true, "x-homeplan": { "hidden": true } },
    "sourceEdge": {
      "type": "object", "readOnly": true, "additionalProperties": false,
      "properties": { "shapeId": { "type": "string" }, "edge": { "type": "string", "minLength": 1 } },
      "required": ["shapeId", "edge"],
      "x-homeplan": { "hidden": true }
    },
    "heightMm": {
      "type": "number", "title": "Height", "minimum": 1, "maximum": 20000, "default": 2400,
      "x-homeplan": { "editor": "length", "quantity": "length", "group": "size", "order": 1 }
    },
    "thicknessMm": {
      "type": "number", "title": "Thickness", "minimum": 1, "maximum": 2000, "default": 200,
      "x-homeplan": { "editor": "length", "quantity": "length", "group": "size", "order": 2 }
    },
    "alignment": {
      "title": "Alignment", "default": "outside",
      "anyOf": [
        { "type": "string", "const": "outside", "title": "Outside" },
        { "type": "string", "const": "inside", "title": "Inside" },
        { "type": "string", "const": "center", "title": "Center" }
      ],
      "x-homeplan": { "editor": "segmented", "group": "placement", "order": 1 }
    },
    "materials": {
      "type": "object", "title": "Materials", "additionalProperties": false,
      "x-homeplan": { "group": "appearance" },
      "properties": {
        "interior": { "type": "object", "title": "Interior", "x-homeplan": { "editor": "material", "order": 1 } },
        "exterior": { "type": "object", "title": "Exterior", "x-homeplan": { "editor": "material", "order": 2 } }
      },
      "required": ["interior", "exterior"]
    },
    "objects": { "type": "array", "items": { "type": "object" }, "x-homeplan": { "hidden": true } },
    "reliefs": { "type": "array", "items": { "type": "object" }, "x-homeplan": { "hidden": true } }
  },
  "required": ["id", "sourceEdge", "spanMm", "heightMm", "thicknessMm", "alignment", "materials", "objects"],
  "additionalProperties": false
}
```

The material and child-item schemas are shortened to `{ "type": "object" }` here; in the real schema each surface material is the full glTF material sub-schema ([object models](object-models.md#surface-material)).

A light's default colour (`defaults.color`, abridged), with conditional fields:

```json
{
  "type": "object",
  "title": "Color",
  "additionalProperties": false,
  "x-homeplan": { "order": 4 },
  "properties": {
    "mode": {
      "title": "Color mode", "default": "fixedWhite",
      "anyOf": [
        { "type": "string", "const": "fixedWhite", "title": "Fixed white" },
        { "type": "string", "const": "colorTemperature", "title": "Color temperature" },
        { "type": "string", "const": "rgb", "title": "RGB" }
      ],
      "x-homeplan": { "editor": "select", "order": 1 }
    },
    "kelvin": {
      "type": "number", "title": "Temperature", "minimum": 1500, "maximum": 9000, "default": 3000,
      "x-homeplan": { "editor": "slider", "quantity": "colorTemperature", "unitSuffix": "K", "step": 50, "order": 2,
                      "visibleWhen": { "property": "mode", "equals": "colorTemperature" } }
    },
    "rgb": {
      "type": "array", "title": "Color", "minItems": 3, "maxItems": 3,
      "items": { "type": "integer", "minimum": 0, "maximum": 255 },
      "x-homeplan": { "editor": "color", "order": 3, "visibleWhen": { "property": "mode", "equals": "rgb" } }
    }
  },
  "required": ["mode", "kelvin", "rgb"]
}
```

Schemas are authored in TypeScript with **TypeBox**, which emits this standard JSON Schema plus static types ([D13](../decisions.md#d13-application-stack)); the examples above are the emitted JSON. Validation uses **Ajv**, an open-source JSON Schema validator that runs in both the browser and Node. One Ajv instance (draft 2020-12, strict, `x-homeplan` registered as a keyword; `shared/domain/validation/ajv.ts`) serves browser and server. [Ajv](https://ajv.js.org/).

## Property editors

A **property editor** is a reusable editor template for one value. Every editor follows one contract, so the panel never needs type-specific code.

| Editor (`x-homeplan.editor`) | Edits | Default for |
| --- | --- | --- |
| `text` | Short strings, such as names | `string` |
| `number` | Plain numbers with optional unit suffix (lm, K) and limits | `number`, `integer` |
| `length` | Lengths with mixed-unit entry (`1.5m`, `3ft`) and live conversion, stored in mm ([units](features/units-and-grid.md)) | `quantity: length` |
| `angle` | Degrees, normalized | `quantity: angle` |
| `select` | Dropdown from the choices, with a searchable variant for long lists | `Choice` with more than three options, or `searchable` |
| `segmented` | A segmented control, with optional `optionIcons` (Phase 5.9) | `Choice` with two or three options |
| `multiSelect` | A set of choices from `items.enum` | `array` of enum |
| `toggle` | Yes / No segmented control, right-aligned; Mixed selects neither (owner, Phase 5 follow-up; replaces the switch, and the app has no other checkboxes or switches) | `boolean` |
| `slider` | A bounded number with a slider and a number box; the preview follows the drag, and the value commits on release; `inverted` shows the complement | — |
| `color` | sRGB 0–255 with swatch and hex/RGB entry | — |
| `vector2Length` | A pair of lengths such as position x/y | — |
| `dateTime` | A local date and time without offset | `format: date-time` |
| `file` | Pick or drop one file; `accept` and `maxBytes` from `x-homeplan` (popup forms only) | `contentMediaType` |
| `readOnly` | Displays a value, including `derived` ones | `readOnly: true` |

Generic editors live in the design system. **Domain editors** need house data:

| Domain editor | Edits |
| --- | --- |
| `material` | A surface material: image, tint, shininess, metallic, and placement, with a preset menu ([D19](../decisions.md#d19-materials)) |
| `image` | Picks a house image or uploads one |
| `templateVersion` | A template reference, with "Update to vN" ([D07](../decisions.md#d07-template-library-and-updates)) |
| `reference` | A stable ID (or, with `multiple`, a list) of another object of `referenceKind`, picked from the tree or viewport (attachment wall, light-group and object-group members) |
| `location` | House location: latitude/longitude with time zone (London by default) |
| `nodeRef` | A glTF node of the template being authored (Object Editor, Phase 2) |
| `lampPower` | A light's lamp power, picked from its lamp type's presets shown as "watts · lumens" (Phase 8.9, [lamp types](features/lighting.md#lamp-types)); the property command then sets the output |
| `materialChoice` | A template material slot offered for choice (Phase 9.1): the slot's own material and its bundled presets as swatches (`SwatchPicker`), then an own colour or texture when allowed; stores no entry, `{ preset }`, or a surface material ([material choices](features/object-templates.md#material-choices)) |

They live in feature code, follow the same contract, and are registered in the same editor registry. The complete list matches [object models](object-models.md#editors-needed).

### Editor contract

Each editor receives (`PropertyEditorProps` in `src/design-system/property-editors/editorContract.ts`):
- the property's schema node, its `x-homeplan` annotation, its current value, and the object that owns it
- the project unit
- whether it is disabled, and whether the multi-selection has mixed values
- any validation error

It reports:
- `onPreview(value)`: optional; for sliders while dragging, never recorded in history.
- `onCommit(value)`: when the value is final; it returns whether the value was accepted, and a rejected value stays in the editor's draft.

Editors keep the raw draft themselves:
- **Commit:** on Enter or when the field loses focus.
- **Escape:** reverts the draft to the committed value.
- **Invalid input** stays in the field with an error and never reaches the model.

## The property panel

The panel is the **live** use of the design system's form builder, `SchemaForm`. The same component, in buffered mode inside `FormPopup`, renders every popup form ([forms and popups](../design-system/README.md#8-forms-and-popups)).

When something is selected, the panel:

1. Finds the selection's type schema (combined with template parameters for template instances).
2. Walks its properties in group and `order` sequence, skipping `hidden` ones and those whose `visibleWhen` doesn't match. The panel is a **flat list of groups, each a form editor bound to one object** (owner, Phase 5 follow-up): the object's declared groups (General, Placement, …) edit the object itself, and every nested object is a group of its own bound to that object, placed after the group it is declared in, never a box inside another group. A group with a single item is titled by that item and shows no second label (an area's floor material is the group **Flooring**). Groups are collapsible and have no background, so fields use the full panel width. The panel's header is the selected object's name after a properties icon (several items: their count and kinds).
3. Renders each property with its editor from the registry: the declared `editor`, or the default for its type.
4. On commit, validates the value against the property's schema, then sends one domain command, `setPropertyCommand(house, objectIds, path, value)`, for every selected object at once; it runs the type's domain rules (for example a window must fit its wall).

### Property groups

Phase 5.7 (owner H9). Every type names its groups by ID from one catalog, `shared/domain/schemas/propertyGroups.ts`; no schema declares a title of its own. `propertyGroups(...ids)` returns them in catalog order with the catalog's titles:

| Group | Holds | Used by |
| --- | --- | --- |
| General | name, kind, fixture, toggles, members, Hidden (Phase 7.5) | house, floor, area, carpet, wall, wall feature, instances, object group, light, light group, guide, roof |
| Template | template version, parameters, flip | instances, staircase |
| Staircase | template, direction, layout, run | staircase, and the area while its kind is Staircase |
| Placement | position, rotation, alignment, face, attachment, along-wall, bottom | shapes, area, carpet, wall, wall feature, instances, light, staircase |
| Size | width, depth, radius, height, thickness, feature depth | shapes, wall, wall feature |
| Emitter | light type, length, width, spot | light |
| Light | colour capabilities, defaults | light |
| Appearance | materials | floor shape (Flooring), carpet, wall, wall feature, instances, house (cap material) |
| Environment | location, north, sun | house |

Groups are collapsible and have no background; collapsing one is remembered for the session by its ID across types (collapsing Placement on a sofa also collapses it on a lamp). Keys were not renamed: types that share a meaning already share keys and schemas (Name, Position), so no migration was needed.

**Multi-selection:** several objects of one kind use that kind's schema, and the header reads "2 × Wall". Objects of different kinds get a shared schema (`sharedSchema.ts`): only top-level properties with the same key and an identical schema in every type, not hidden, grouped by their catalog groups (Phase 5.7: a carpet and a light share Name and Position); the header reads "3 items: 2 Carpets, 1 Light", and with nothing shared the panel says so. Differing values show **Mixed** (`mixedValues.ts` lists the differing JSON Pointers). A commit writes the value to every selected object as one command.

**Field presentation (Phases 5.8–5.9):** `inlineLabel` (e.g. "W") puts a short label inside a length field, and two consecutive inline-labelled fields share one row titled "Width × Depth"; vector fields show their axis letters inside, coloured like the axes. A single choice with 2–3 options renders as a **segmented** control (with optional `optionIcons`), more as a dropdown; `Choice`'s `editor` option forces either. Composite editors (material, material choice, location) are **sections** (Phase 19.7): a semibold title with space above, stacked under the group header ([design system](../design-system/README.md#7-initial-component-responsibilities)).

The panel contains no per-type code: adding a type or a template parameter only adds schema. Feature code may add a section after the properties for something that isn't a property of the object, such as a light group's **Set on N members** (enabled, brightness, and colour written to every member as one step) or the selection actions (Delete, Group, Ungroup).

## Editing: live, with Undo

- There is **no panel-wide Cancel** and no cloned copy of the selected object. The document store remains the only editable model ([editing lifecycle](editing-lifecycle.md)).
- Each committed field is **one undo step**. A slider drag previews live and commits once on release. A multi-selection edit is one step.
- **Escape** reverts only the field being typed in.
- Selecting another object while a field draft is valid commits it. While a draft is invalid, it blocks the selection change until it is fixed or Escape discards it ([D09](../decisions.md#d09-saving-cancellation-and-model-undo)).
- A rejected domain command (for example an opening that no longer fits) leaves the model unchanged and shows the reason on the field.

## Design-system documentation

Every editor and the panel itself get `/ds` pages ([workbench](../design-system/workbench.md#page-map)):
- the editor contract and registry
- one page per editor, showing its live states, the schema snippet that selects it, and View source
- a property-panel playground that renders fixture schemas (Wall, Light, a window template) next to their live JSON value

Domain editors are documented with fixture data.

## Verification scenarios

- Selecting a wall shows Height, Thickness, Alignment, and Materials in schema order; IDs and the source edge are not shown.
- Typing `3m` into Height commits 3000 mm on Enter as one undo step; Escape before Enter restores the previous value.
- Choosing color mode `rgb` hides the Kelvin field and shows the color editor.
- Dragging brightness previews continuously and adds exactly one undo step on release.
- A staircase template that declares a `stepCount` parameter shows it in the panel without any panel code change.
- Two walls with different heights show **Mixed**; entering a value sets both in one undo step.
- An out-of-range value stays in the field with the limit shown and does not change the model.
- The server rejects a saved document that violates the same schema the panel used.
