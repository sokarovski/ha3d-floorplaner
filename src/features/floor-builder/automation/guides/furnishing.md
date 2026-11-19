# Objects, openings, lights, and materials

To create a new template from your generated model, read `window.homeplan.docs.read("templates")`: import the file with `import_template`, inspect its draft, and call `save_template_version` before placement. Homeplan handles every backend request.

Call `list_templates` to discover template IDs, versions, and contracts. Call `get_template` for the chosen template's metadata, dimensions, defaults, and attachment hosts. `place_object` accepts Areable templates; `place_opening` accepts Wallable templates (doors/windows). Specify a version when exact reproducibility matters; otherwise the wrapper pins the latest available version when placing. Asset loading and backend calls are performed by Homeplan.

Object positions are room-local. For wall-mounted objects supply a wall ID in that room. An opening's position is measured along its hosting wall; inspect the current wall/geometry instead of guessing its orientation. Curved-wall openings are unsupported. Use `get_geometry` after placement to find openings that do not fit or conflict across shared walls. These geometry flags do not imply that the document edit failed; the existing editor preserves authored guides and flags repair work.

`add_light` creates a point light. `add_carpet` creates a rectangular rug. Read the created entity's schema, then use `set_properties` to adjust dimensions, placement, light geometry/defaults, or materials. Carpet pieces can be edited with shape tools. Every wrapper returns stable IDs for later operations.

`get_entity_schema` returns the property panel's authoritative schema, including template parameters. `set_properties` accepts an entity ID and `changes: [{ path: ["property", "nestedProperty"], value }]`. Paths are property names, not JSON pointers or array indexes. IDs, hidden structural fields, read-only fields, and child collections cannot be changed this way. Use structural tools to create/delete entities and footprints.

For a wall, edit `heightMm`, `thicknessMm`, `alignment`, or a material at `materials.interior` / `materials.exterior` (as arrays of path segments). For floor material, target the room's `floorSurfaceId` and the `material` property. For a template instance, target its `parameters` fields shown by the schema. Use `list_material_presets` to get an existing material value, then copy that material with `set_properties`. `list_images` supplies house image IDs for texture references. Assets remain server-owned and material values follow the existing glTF material schema.
