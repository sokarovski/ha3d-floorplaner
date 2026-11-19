# Wall relief groups (multi-shape wall features)

Updated: 2026-11-16.

Status: **resolved by the owner, 2026-11-16; implemented, awaiting owner check.** It extends [D21](../../decisions.md#d21-wall-reliefs), which defers free shapes on wall faces. Field names are provisional until implemented.

## Why

A wall relief is one rectangle, so an arch (the peach arch behind the bedroom TV) has to be faked with 31 stacked rectangles, one per strip. Each strip is a separate relief to select, colour, and delete. Carpets already solve this for the floor: a carpet is a group of shapes that combine into one footprint with one material. Walls should work the same way.

## The idea in one sentence

In the wall face view you add a **feature** (a group), draw as many rectangles, circles and polygons into it as you like, press Done, and the shapes merge into one outline with one depth and one colour.

A feature is simply a shape on a wall face. Its depth decides what it is: positive is extruded out, negative is pushed in, and **0 is a flat shape that is not extruded**. Painting a coloured shape on a wall instead of using a texture is the same feature with depth 0; there is no separate paint mode.

## Editing flow (easiest possible)

1. Double-click a wall to open the face view (unchanged).
2. Click **Add** (header, or the wall row's Add menu) and choose **Feature**. The new feature is selected and opened for editing, like entering a carpet.
3. Draw with the same tools as the Carpet Editor: **R** rectangle, **C** circle, **P** polygon pencil, typed sizes, same snapping. Each shape you draw is added to this feature; overlapping shapes merge visually into one outline. **Nudge** and **Select** handles work on a shape inside the feature.
4. Everything outside the feature is dimmed and not selectable, so you cannot touch another feature by accident.
5. **Done**, Escape on an empty tool, or a double-click off the feature closes the feature and returns to the face view, with the whole feature selected.
6. Select the feature to set **Depth** (positive out, negative in, 0 flat and not extruded) and **Colour/material** in the property panel, or use **Push/pull** on it as today. One depth and one colour for the whole feature; need a different depth or colour, add another feature.

An arch is therefore: Add feature, draw a rectangle, draw a circle on top of its upper edge, Done, set colour. No strips.

Everyday rules:

- Double-click a feature (or Enter on its tree row) re-enters it to add or edit shapes. Delete on a shape removes the shape; deleting the last shape deletes the feature.
- In the face view, a selected feature shows its box with corner and side handles, the same [shape group box handles](../screens/floor-builder.md#shape-groups) as a carpet's (Phase 7.2): they resize the whole feature, all its shapes together (opposite side fixed, Option about the centre, Ctrl without snapping, typed `W x D`). Nudge moves the whole feature; a feature does not turn.
- Each Done, draw, move, resize, and property change is one undo step, the same as carpets.
- The existing rectangle relief tools keep working unchanged: **Rectangle** in the face view without an open feature still creates a one-shape feature, so simple boxes and niches stay one drag.

## Data model

`wall.reliefs[]` entries are features (house schema version 4). A relief from an older house is a feature with exactly one rectangle shape: a migration (`migrateV3Reliefs`) converts it on open.

| Field | Meaning |
| --- | --- |
| `id`, `name`, `face` | as today |
| `depthMm`, `material` | one per feature, as today |
| `shapes[]` | rectangle, circle or polygon, positioned in the face frame (`x` along the wall from the span start, `y` up from the floor); the same shape schemas as floor and carpet shapes; the group has no placement of its own, so Nudge on the whole feature shifts every shape |

The authored shapes are guides; the merged outline, strips, and faces are derived and never saved, matching the project's guide/derived rule.

## Geometry (reuse the existing 2.5D walls)

[RealAllWalls](geometry-groups.md#authored-guides-and-derived-geometry) builds walls as height slices with a constant footprint, and a relief is one prism between a bottom and a top. A feature does not need a new boolean step:

1. Union the feature's shapes into one polygon with the existing polygon kernel (the same one carpets use).
2. Cut that polygon into horizontal bands at every vertex height, plus a fixed step (default 10 mm) across curved edges. Each band is a rectangle from its left to right extent.
3. Each band becomes an ordinary relief prism, so union, niche cutting, 20 mm back limit, flags, picking and material ownership all work as in D21.

Curves therefore render as fine horizontal steps, invisible for flat or shallow features and slightly stepped for deep curved niches. A true curved boolean stays deferred. Implementation conventions: the curve step is 10 mm, vertically adjacent bands with the same extent merge, and a feature is cut into at most 160 bands (the step widens beyond that).

**Flat shapes (depth 0).** Today a depth-0 relief is only an outline that the editor draws; the wall shows nothing. For a feature, depth 0 is a real shape that is not extruded: its outline is coloured onto the wall face with the feature's material and adds no geometry. This is how the TV arch should be made, with no 3 mm lip. Implementation convention (first version): a flat feature is built as a film 1 mm thick, so it shows as colour on the wall without a visible lip; a true zero-thickness face remains possible later.

## What changes in the app

- Schema: `WallRelief` is `{ id, name, face, depthMm, material, shapes }`; the old rectangle fields are migrated away. Owner spec to update with it: [object models: wall relief](../object-models.md#wall-feature-relief-group) and [floor builder: wall face view](../screens/floor-builder.md).
- Commands: add feature, add/replace/delete a shape in a feature, move (`moveReliefCommand`), resize (`replaceShapeGroupGeometryCommand`, shared with the area floor and carpets, Phase 7.2), and push/pull on the feature as a whole. All undoable through the same command layer.
- Editor: a face-view sub-mode that mirrors the Carpet Editor (same tool set, same dimming, same Done behaviour). No new tools.
- Property panel: the existing schema-driven relief form, with the shapes listed as children in the tree, as carpet pieces are.
- Browser agent tools: `get_entity_schema` and `set_properties` follow the new schema; an agent can add one feature with a rectangle and a circle instead of stacking strips.

## Acceptance

- Draw the bedroom arch with one rectangle and one circle in one feature, set depth 0 and a peach colour, and get a single selectable, deletable, colourable object.
- A feature made of two overlapping shapes shows one merged outline and one set of faces; there is no seam where they overlap.
- Existing rectangle reliefs, including the living-room TV niche, open, edit, and save unchanged.
- No wall-geometry issues for a feature inside the wall's span and height; the existing "does not fit" flag covers a feature that leaves them.
- Replacing the 31 strips on the Bedroom TV wall with one feature leaves the rendered wall visually the same (not yet done on the live house: it still holds the strips, migrated to rectangles).

## Owner decisions (2026-11-16)

- **No subtractions for now.** A feature only adds shapes; they combine into one shape. A ring is two features.
- **Group, then style.** Add shapes to the group until you leave it, then apply the material (or depth) to the combined shape. Shapes inside a group have no material of their own.
- **All three tools** (rectangle, circle, polygon) work inside a feature from the first version, exactly as they do for areas and carpets.
- **One official 2D shape editor** (next section) serves areas, carpets, and wall features, so a fix or improvement lands in all three.

## The 2D shape editor

Floor shapes, carpet pieces, and wall-feature shapes are the same thing: non-extruded 2D shapes (rectangle, circle, polygon) with a position and rotation, combined by union into one outline. What differs is only the plane they live on and what the combined outline becomes:

| Host | Plane | The combined outline becomes |
| --- | --- | --- |
| Area | the floor plan | the room's floor and, through its edges, wall guides |
| Carpet | the floor plan (carpet-local axes) | a flat floor surface with a material |
| Wall feature | the wall face (x along the wall, y up from the floor) | a coloured flat shape, or a box or niche when it has depth |

The editor is defined once, against two small ideas:

- **Shape set**: a reference to the list of shapes being edited (`floor` of an area, a `carpet`, or a `wallFeature`). Add, replace, and delete shape commands take a shape-set reference instead of an optional carpet ID. Opening a set is "entering a group".
- **Edit plane**: how the editor reads a pointer position and draws overlays. The floor plan and a wall face each provide it, so the rectangle, circle, polygon, Select, Nudge, Rotate and Corner-edit tools, snapping, handles, typed sizes, dimming of everything else, and the Done behaviour are shared code. The wall face's plane maps x to the distance along the wall and y to the height, so the tools need no wall-specific variants.

Nothing is persisted for the plane; the shape lists stay in the document as authored guides.

