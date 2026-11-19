# Object controllables and the Home Assistant boundary

Updated: 2026-11-14.

Status: objects can declare click, long-click, and double-click controllables; the builder collects this data and Home Assistant cards own action binding. Manifest schema, API routes, and hit-target representations below are recommendations.

**Post-MVP:** HA-specific controllable authoring UI, manifests/endpoints, bindings, and hit-region exports are deferred with all HA/card work. Retain stable builder model IDs; the following contract is future design context, not an MVP implementation checklist.

## Purpose

Describe the interaction points available in a house so a Home Assistant card can discover them and connect them to Home Assistant behavior later.

Examples of eventual card behavior are clicking a light to toggle its bound entity or holding an air conditioner to open an appropriate information popup. These are examples of card-owned bindings, not actions implemented or selected by the builder.

## Responsibility boundary

| Floor Plan Builder | Home Assistant card |
| --- | --- |
| Declare object interaction points and supported gestures | Bind those points to entities/actions and persist binding configuration |
| Give objects and controls stable identities | Recognize runtime gestures and resolve configured actions |
| Collect/expose a house's controllable definitions | Execute actions, toggle devices, or open information popups |
| Supply scene/export references for hit targeting | Perform hit testing and gesture handling for the display mode |
| Let authoring gestures select/edit models | Resolve runtime gesture timing and navigation conflicts |

The builder does not need to authenticate to Home Assistant, call services/actions, select target entities, or implement device popups for this feature. Light visual-state metadata is now described in the [lighting specification](../builder/features/lighting.md); the card owns those bindings and runtime updates as well. Other future state-visualization mappings remain separately scoped.

## Controllable definitions

Each object/template may provide zero or more controllables. A controllable can represent the whole object or a named part/region; support for multiple separate parts is a recommended extension rather than a required first-release authoring tool.

Each definition should include:

- A stable control identifier local to the object/template, such as `body`.
- A human-readable label for discovery/configuration in the card.
- The supported gestures: **click**, **long click**, and/or **double click**.
- A target description identifying the object, subpart, or interaction region.
- Object identity and house/floor/area context when collected into the house manifest.

An object may expose a subset of gestures, and its existence alone does not imply it is controllable. Suggested serialized gesture names are `click`, `longClick`, and `doubleClick`; exact naming remains provisional.

The corresponding Home Assistant action configuration concepts are `tap_action`, `hold_action`, and `double_tap_action`. The card translates the builder's gestures into its chosen configuration model. Specific action/entity settings stay outside the builder manifest. [Home Assistant dashboard actions](https://www.home-assistant.io/dashboards/actions/).

## Light identity and visual-state capabilities

A light remains semantically a light whether it is bulb-like or linear, white or RGB. Keep its existing gesture identities when switching color modes. Export its supported render states and authored defaults separately from gesture declarations, as described in [lighting](../builder/features/lighting.md).

Recommended manifest extension: a `stateTargets` collection containing object IDs, semantic kind `light`, rendering capabilities, and defaults, alongside `controls`. A light can be a visual-state target even if it declares no click/hold gesture. Metadata describes scene rendering; it does not claim that a bound physical device supports the same color modes.

The card inspects the bound entity, supplies supported state values, and uses authored fallbacks for missing fields. This does not require RGB sliders or service bindings in the builder's controllable definitions. The manifest example below illustrates gesture entries; the visual-state extension's exact schema remains provisional.

## Stable identities

Recommended binding identity is the tuple **house ID + placed object ID + local control ID + gesture**. Keep floor/area identifiers as current context, not essential parts of binding identity, so moving the same object can preserve its bindings.

- Renaming a house, floor, area, or object does not change its identity.
- Moving/repositioning or reparenting the same object preserves its object/control IDs.
- Two instances of one template get different object IDs, even if both have a local `body` control.
- Duplicating an object creates a new instance identity. Duplicating a house needs an explicit ID/remapping policy later.
- Do not use display names, filesystem paths, mesh indexes, or screen coordinates as permanent binding keys.
- Template updates must preserve stable control IDs where their meaning is unchanged. Removal/replacement of controls must be visible to the card rather than silently redirecting an old binding.

## House controllables manifest

Collect the declared controls from the house's floors/areas and their object instances, including objects under walls. Generate a JSON manifest that lets the card enumerate the house's controllables without reverse engineering imported meshes.

Recommended fields and example:

```json
{
  "schemaVersion": 1,
  "houseId": "house-1",
  "revision": "house-snapshot-7",
  "controls": [
    {
      "objectId": "ac-instance-1",
      "controlId": "body",
      "label": "Living Room Air Conditioner",
      "floorId": "floor-1",
      "areaId": "area-1",
      "gestures": ["click", "longClick", "doubleClick"],
      "target": { "kind": "object", "objectId": "ac-instance-1" }
    },
    {
      "objectId": "pendant-instance-1",
      "controlId": "body",
      "label": "Living Room Pendant",
      "floorId": "floor-1",
      "areaId": "area-1",
      "gestures": ["click"],
      "target": { "kind": "object", "objectId": "pendant-instance-1" }
    }
  ]
}
```

These entries declare available gestures. There is deliberately no `entity_id`, toggle instruction, service call, or popup action in this authoring data.

Proposed API: `GET /api/houses/:houseId/controllables`. Also include the matching manifest in exported house packages. Exact API routes and export packaging remain open; persistence uses the existing folders/JSON model without a database.

Recommended design: persist declarations with object instances/templates and derive the manifest, rather than maintaining a second independent editable control registry. Freeze the manifest with the scene/export revision so consumers can tell whether definitions match their assets. Refresh/invalidation semantics remain to be specified.

## Interaction targeting in both display modes

- **Live 3D:** preserve a mapping from rendered object meshes or explicit hit-target geometry to stable object/control IDs. A single object with several mesh parts can still expose one whole-object control.
- **Layered images:** PNG files alone do not identify objects. Exports need associated interaction-region data, such as projected polygons or masks, mapped to the same control IDs for each camera/image size.
- Image target data must belong to the same camera, scene revision, and layout as its renders. The card handles responsive scaling and hit testing.
- Overlap, occlusion, target priority, invisible-light markers, and whether an invisible emitter has a separate runtime hotspot need a later interaction/export design.

Separate authoring selection from these runtime declarations. Clicking or dragging a lamp in the builder edits/selects it; it does not trigger a bound Home Assistant action. Gesture thresholds and suppression of single-click actions during a double click/hold are card responsibilities.

## Verification scenarios

- An imported template instance exposes its declared controls with stable identity.
- Two instances of the same template produce separate control entries and can be bound independently by a card.
- Rename/move operations preserve object/control identity; duplicate operations allocate a distinct object identity.
- Objects without declared controls do not appear as interactive by default.
- The API/export manifest and scene assets share a traceable revision.
- Image exports can associate hit regions with the same controls used by the 3D representation.
- Builder editing neither executes Home Assistant actions nor embeds entity/action bindings in the manifest.
