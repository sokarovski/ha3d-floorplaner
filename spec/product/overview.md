# Product overview

Updated: 2026-11-16.

## Purpose

Let a homeowner build a realistic, editable model of their home from measured rooms, and later use it as a Home Assistant dashboard for viewing and controlling devices.

The model is a semi-top, open-top view. **Ceilings and room-spanning roof covers are never rendered.** Roof profiles trim upper geometry and leave the rooms visible. Virtual overhead references can position fixtures without creating ceiling geometry.

## Product parts

| Part | Responsibility | Release |
| --- | --- | --- |
| Floor Plan Builder | Author houses, floors, areas, walls, materials, objects, and lights; preview, save, and export | MVP |
| Rendering/export pipeline | Derive PNGs and optional photorealistic renders from the authored model | MVP (local outputs) |
| HA viewer | Read-only Home Assistant panel showing one house and live entity state ([D23](../decisions.md#d23-ha-viewer-mvp)) | Active proof of concept, alongside the MVP |
| Home Assistant display | Present the house, bind objects to entities/actions, follow device state | Post-MVP |

The MVP runs as a standalone web application with a Node.js backend. Packaging it as a Home Assistant add-on (which HA's documentation calls an [app](https://contributors.home-assistant.io/apps/)) is post-MVP. See [MVP scope](mvp-scope.md).

## Required capabilities

These are owner requirements. Their phasing is in [MVP scope](mvp-scope.md).

- **Stack:** a React SPA with strict TypeScript components and the shared [design system](../design-system/README.md). Rendering uses the browser GPU with Three.js, with PNG preview and final exports.
- **Storage:** folder/JSON persistence with no database of any kind, including embedded ones. Saves write full JSON documents, and each house keeps a Git revision history in its folder.
- **Houses and floors:** a house collection with named building floors. One floor is rendered at a time.
- **Areas:** named areas whose floor shapes are drawn from shapes and polygons. Walls are extruded from those shapes (straight edges and circle arcs) with inside/outside/center alignment, thickness, height, and interior/exterior materials. Wall faces can carry boxes and niches (wall reliefs).
- **Arranging areas:** areas can be moved and rotated, and wall faces tucked together. Clashing walls merge into one compound mesh with room-side materials.
- **Units:** mixed-unit dimensional entry and a saved project unit (default millimeters). Internally, 1 unit = 1 mm.
- **Objects:** resizable doors and windows that cut matching openings; ornaments and appliances, which can be grouped; carpets.
- **Templates:** reusable object templates in an open standard (glTF), with the application's own properties for direction, resizing, stacking, attachment, and materials layered on top. Existing STL models can be imported and converted.
- **Lighting:** area-owned lights, including linear sources, white/temperature/RGB modes, and groups.
- **Environment:** house-wide location, north, and sunlight time.
- **Special areas:** staircase areas with local floor openings; measured construction guides; roof-profile cuts.
- **Preferences and identity:** global application preferences stored separately from house models. Stable object identities so that future Home Assistant bindings survive renames and moves.

## Intended Home Assistant display modes (post-MVP)

- **Live 3D:** render the house in the HA browser. Device state drives light appearance, and the card owns gestures, bindings, and actions.
- **Layered images:** compose pre-rendered photorealistic images in a Picture Elements–like display. This needs a validated compositing design.

Which mode ships first is decided when HA work begins. The [HA viewer MVP](../home-assistant/viewer-mvp.md) is a first live-3D proof of concept. See [Home Assistant](../home-assistant/README.md).

## Responsibility boundaries

- **Authored data:** the authored house is the source of geometry, templates, materials, and light defaults. Home Assistant will supply bindings and runtime state, never rewriting authored defaults.
- **Guides and derived geometry:** floor shapes and walls are editable guides. RealFloor, RealWall, and RealAllWalls, along with meshes and images, are derived outputs ([geometry groups](../builder/features/geometry-groups.md)).
- **Object assets:** glTF is the object template format; STL is an import source or an optional geometry export. Neither is the editable house format.
- **Theme:** the UI theme changes panels and editor helpers, not scene materials or lighting.
- **Display units:** display units change entry and readouts; they never rescale geometry.

## Out of scope

None of the following is planned for this version:

- Automatic floor-plan or image recognition, and plan-image tracing.
- Arbitrary CAD editing.
- Weather or measured daylight simulation.
- Multi-user collaboration and user accounts ([D12](../decisions.md#d12-user-identity-and-access)).
- A general template programming environment.

Post-MVP items with retained design notes are listed in [MVP scope](mvp-scope.md#outside-the-mvp).
