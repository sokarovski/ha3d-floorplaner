# Measuring tape and construction guides

Updated: 2026-11-18.

Status: MVP Phase 1. A tape tool with guide-line and point-marker results, live typed distances, and unit conversion is an owner requirement. Defaults are resolved in [D16](../../decisions.md#d16-interaction-defaults-and-support-limits).

## Purpose

Measure the model and place construction references at known real-world distances. These references help users locate room features and place roofs ([roofs](roofs.md); the Phase 2 sloping roof cuts were [superseded](roof-cutouts.md)) from measurements rather than drawing an approximate line in perspective.

These tools are also available in Room Editor for source shapes and the polygon pencil. Distances are measured in the active group's plane and converted into its local canonical millimeter coordinates. With Magnetic on, vertices and edges snap to guides ([D16](../../decisions.md#d16-interaction-defaults-and-support-limits)). Source shapes store the resulting real coordinates independently of guides. See [geometry groups](geometry-groups.md).

## Two measurement results

| Mode | Result | Intended use |
| --- | --- | --- |
| Guide line | A dashed construction/ruler line in the active editing plane | Mark a reference offset across an area/profile |
| Guide point | An X at the measured endpoint | Locate a particular point at a measured distance |

Owner-described automatic behavior: starting from a position along a line produces a ruler/guide line; starting from an edge produces an X endpoint marker. Because a line and an edge can identify the same geometry, the result is chosen explicitly instead (review inference; the two outcomes are unchanged). As built: the tape makes a **guide line** by default and a **guide point** while **Alt/Option** is held at the second click; the readout says which ("· guide line" / "· guide point"). There is no automatic choice from the start point and no toolbar toggle.

## Dragging and typed distances

- Activate the tape (**T**, in the overview and the Room Editor) and click the origin or reference; this locks the operation ([click–move–click](../screens/floor-builder.md#operation-input-click-lock-type-commit)). Move to establish the direction and distance.
- Show the live measured distance in the selected project display unit.
- While the operation is locked, typing a distance such as `1.5m` replaces the measured length or offset precisely.
- Parse the suffix, convert into canonical metric units, and display the result in the active project unit. `1.5m` becomes `1500 mm`, `150 cm`, or the equivalent inch display.
- Input without a suffix uses the project's saved default unit (`mm` initially). Support explicit `mm`, `cm`, `m`, `in`, and `ft` suffixes with the shared property-field parser; inches use exactly `25.4 mm` and feet exactly `304.8 mm`.
- Place a dashed guide or X marker according to the active result mode. Enter or a second click commits, and Escape cancels.

Typed mixed-unit input and realtime conversion apply to the tape and every length property, using the same saved project-unit setting. Meters and feet are required project-unit choices alongside millimeters, centimeters, and inches. See [editor settings](units-and-grid.md).

## Measurement plane and direction

Measurements must have a defined geometric reference/plane. In Room Editor, measure in the 2D area plane. (The Phase 2 roof-profile workflow measured in a vertical side-profile plane; it was removed with the roof cuts in Phase 19.2.)

As built, the tape measures in the **floor plane** of the active building floor in both the overview and the Room Editor, and both clicks use the normal inference (corners, edges, guides). A guide line passes through the two clicked points (an infinite line in that direction), and a guide point is an X at the second point; with Magnetic on and no typed value the direction snaps to the plan axes. A parallel-offset guide from a reference line is not implemented. Measurements shorter than 1 mm are not committed. Free 3D measurement is post-MVP.

Show which reference and direction are active. Do not derive physical distances from unprojected screen pixels or let a perspective view make the result ambiguous.

## Guide lifecycle and rendering

Guides are editor helpers, not walls, flooring, or physical objects. They can be targets for positioning profile points and other editing operations where supported.

Behavior:

- Keep committed guides available while the user edits a roof.
- Allow selecting/deleting guides without changing house geometry.
- Exclude dashed guides, X markers, and measurement labels from final PNGs, renders, and geometry exports.
- Keep grid visibility, Magnetic behavior, and tape activation as independent settings/tools. Magnetic also governs snapping to guides.

Guides are stored per building floor (`floor.guides`: `kind` line or point, `visible`, and the two floor-coordinate points `aMm`/`bMm`) and reload with it. They are static and do not follow geometry edits. The tree's **Guides** row under the building floor (shown once a guide exists) lists them as "Guide line 1", "Guide point 2", …; a guide's **Visible** property hides it (its row is muted), Delete removes it, and its **Clear all guides** action removes every guide of the floor in one undo step. A hidden guide is not a snap target and is not shown in the roof profile. A saved roof profile must store its actual coordinates and must not depend on a temporary guide continuing to exist.

## Verification scenarios

- Both dashed-line and X-marker results can be deliberately produced.
- Typing `1.5m` during a drag commits a `1500 mm` physical distance regardless of display units.
- Unsuffixed distances use the selected unit; invalid input is reported rather than interpreted as a different distance.
- A guide offset is measured in the intended plane/direction, consistently at different zoom levels.
- Construction helpers assist roof-point placement and never appear in final rendered or mesh outputs.
