# Arranging areas and merging walls

Updated: 2026-11-16.

Status: resolved ([D05](../../decisions.md#d05-walls-between-adjacent-areas)). The following are owner requirements:

- Areas are arranged next to each other and can be rotated.
- Wall faces are tucked against each other.
- Clashing walls merge into one compound mesh, and each exposed side keeps its room's interior material.
- Contact faces are removed.
- The two named snap results hold: **Touching** (the walls add up) and **Full clash** (one shared wall as thick as the thicker one).

Tolerances and batching are implementation conventions.

## Derived wall layers

| Layer | Scope | Purpose |
| --- | --- | --- |
| Wall (guide) | One authored wall | Edge anchor, span, alignment, height, thickness, materials, hosted openings |
| **RealWall** | One wall | That wall's own solid: its thickness band from alignment, height, and openings. Used for picking, selection highlight, and provenance |
| **RealAllWalls** | The active floor | The compound mesh of all RealWalls on the floor, merged where they clash or touch. Internal and contact faces are removed, and each exposed face keeps the material of the wall and room it faces. This is what is rendered and exported |

RealWall and RealAllWalls are derived and never persisted. Rendering both the RealWalls and RealAllWalls would double the geometry, so only RealAllWalls is drawn. RealWalls are used for picking and highlight overlays.

## Arranging areas

Each area is drawn and walled on its own (see the [builder workflow](../README.md#main-workflow)) and then placed on the floor:

1. **Move.** Drag the area in the floor layout. Its floor shape, walls, objects, and lights move together.
2. **Rotate.** Rotate the area about its bounding-box centre with one of the Rotate tool's four grips, or type an angle. The dragged grip locks onto each quarter turn when near it and is free elsewhere; Shift allows quarter turns only and Ctrl disables snapping ([rotating rooms](../screens/floor-builder.md#rotating-rooms)). Aligning to a rotated neighbour is done by dragging (step 3).
3. **Tuck face to face.** With the Nudge tool, grab one of the area's walls by its **inner or outer edge** and drag it onto any inner or outer edge of another area's wall; it snaps flush (Phase 3: no separate click-to-tuck tool). If the walls are at a small angle, the drag rotates the area about the grab point until they are parallel and snaps it flush (drag and drop is the way to align rooms); the Rotate tool remains for deliberate rotation. A tuck is one undoable command.
4. **Push detents.** Dragging by a wall-line handle toward a parallel neighbor offers two detents as shortcuts for the common cases:

| Arrangement | Room-contour separation | `20 + 20 cm` | `20 + 40 cm` |
| --- | --- | --- | --- |
| Detent 1: **Touching** | `tA + tB` (outer faces coincide) | `40 cm` wall | `60 cm` wall |
| Anywhere in between (partial clash) | between the two detents | `20`–`40 cm` | `40`–`60 cm` |
| Detent 2: **Full clash** | `max(tA, tB)` (the thinner wall lies completely inside the thicker one) | `20 cm` shared wall | `40 cm` shared wall |
| Pushed past Full clash | less than `max(tA, tB)` | wall pokes into the other room: **flagged** | **flagged** |

Equal walls have two clean results (Touching and Full clash); unequal walls also allow any partial clash between them. From Touching to Full clash, no wall enters either room. Only pushing past Full clash makes a wall intrude.

Tucking and detents change only the area's transform. Source thicknesses, alignments, and floor shapes never change. Moving the area away restores separate walls.

### What face combinations produce

The face pair the user tucks decides the result:

| Moving face → target face | Result |
| --- | --- |
| Outer → outer | Walls touch, the bands sit side by side, and the contact face is removed. Same as **Touching** |
| Inner of the thinner wall → outer of the thicker wall | Bands overlap fully and become one shared wall of the thicker thickness. Same as **Full clash** |
| Inner of the thicker wall → outer of the thinner wall | The thicker band pushes past the thinner one into the other room. Allowed, but **flagged**: the wall intrudes into that room's floor shape |
| Inner → inner | Room contours coincide, so each wall extends into the other room. Allowed, but **flagged** as intruding |

Flags never block an edit. They show a warning on the affected walls with a one-click "snap to shared wall" fix that moves the area to Full clash. For inside- and center-aligned walls, the same face relationships apply to their bands.

Magnetic governs the proximity capture for moves, rotation, and detents. With Magnetic off, free and numeric placement still merges walls that actually touch or overlap. Geometric contact tolerance is physical (recommended 0.5 mm) and independent of zoom, so a real gap never disappears.

## Building RealAllWalls

Yards (Phase 17.2, [yards](yards.md#derived-geometry)) take no part: their walls are fences drawn as templates, never united with other walls, cut by their gates, or checked for intrusions; a house wall standing in a yard is not an intrusion.

All walls are vertical prisms, so construction is 2.5D and needs no general 3D CSG:

```text
wall guides + area transforms
  → RealWall bands: contour span + alignment + thickness, per area
  → split by height bands (each distinct wall height)
  → per height band: 2D polygon union of all bands on the floor
  → classify each union edge by provenance: which wall/room face it came from
  → extrude; drop internal and contact faces; keep stepped tops
  → cut openings through the full local depth
  → walls rise to the floor's roof (19.2: bands under it raised to the underside over them)
  → clip by the roof, each planar piece over its own plan region (sloped caps, step faces at its outline)
  → faces with material regions, UVs, and back-references to source walls
  → optional batching (never changes geometry)
```

### Face ownership and materials

- An exposed face that came from a wall's interior side uses that wall's interior material and mapping.
- An exposed face from an exterior side uses that wall's exterior material.
- On a shared wall, each side shows the interior material of the room it faces.
- **Caps:** tops, exposed ends, junction caps, and opening reveals use the house's neutral cap material (default plain white). Per-wall cap materials are post-MVP. Caps are narrow cross-sections and never form a ceiling.
- **Splits:** material regions split where different walls own different spans of one face. Textures are never averaged or picked globally for a merged mesh.
- **Ambiguity:** if two rooms claim the same exposed face (an intrusion case), the face uses the wall whose band is outermost there, and the conflict is flagged.

**Provenance recovery (implementation, `shared/geometry/provenance.ts`).** Polygon booleans lose edge identity, so every outline segment of a height slice is matched back to the RealWall band faces it lies on. A face is a candidate when both segment ends are within the 0.01 mm on-line tolerance of the face line and the face's outward direction matches the outline's. The segment is split at every candidate face end. Ownership intervals use the actual projected source endpoints; the on-line tolerance does not extend a face length. Collinear wall pieces that only meet at an endpoint therefore have separate owners without a false `ambiguousOwnership` warning when an open-plan floor is split into areas. Actual overlapping interior faces still report the warning. Each piece then gets one owner, by priority: interior face, then exterior face, then band end. Among equal sides, the thicker band wins, then the lower wall ID. Two interior faces from different areas on one piece are flagged `ambiguousOwnership`. Contact faces never reach this step, because the union already removed them. A piece without a face is a cap: a junction cap or an opening reveal. Band ends are also capped, but keep a back-reference to their wall. Opening prisms span the host band plus every parallel band that touches or overlaps it over the opening's width (widened by the contact tolerance). They are subtracted per height slice.

**Output contract (`shared/geometry/realAllWalls.ts`, types in `realAllWallsTypes.ts`).** `buildRealAllWalls(floor, resolveOpeningSize)` returns:

- `bands`: the floor-frame RealWall pieces, used for picking and highlight.
- `openings`: the prisms.
- `reliefs`: the box (added) and niche (cut) prisms of wall features (Phase 5.0, [wall relief groups](wall-relief-groups.md#geometry-reuse-the-existing-25d-walls)).
- `roofLimit`: the floor's roof in Cuts walls mode as planar pieces over their plan regions ([the roof cuts walls](roofs.md#the-roof-cuts-walls), Phase 19.2), applied to the mesh, or null. The `slices` stay unclipped (with risen walls); `bands` carry the risen heights.
- `slices`: per height band, the footprint and the classified outline edges `{ start, end, owner: { wallId, areaId, side } | null }`.
- `issues`: `orphanWall`, `intrusion`, `ambiguousOwnership`, `openingDoesNotFit`, `openingUnsized`, `openingConflict`, and for wall features `reliefDoesNotFit`, `reliefOnCurvedWall`, and `reliefTooDeep`.
- `mesh`: `positions`, `normals`, and `uvs` (`Float32Array`), plus `indices` (`Uint32Array`). Positions and normals use plan axes `(x, y, h)` in mm. UVs are physical mm: `u` runs along the face, to the right when seen from outside it, measured from the owning wall's source-edge start, and `v` = h. Horizontal caps use plan `(x, y)`. `groups` are contiguous index ranges keyed by `{ kind: "wallSide", wallId, areaId, side, reliefId? }` (a relief's own faces carry its ID) or `{ kind: "cap" }`. `triangleFaces` (`Int32Array`) maps each triangle to an entry in `faceRefs`, or to −1 for caps without an owner: tops, sills, lintel undersides, reveals, and junction caps. Top-cap picks use `wallsAtPoint`.

### Junctions

MVP supports parallel shared walls, L-corners, and T-junctions in any combination across areas. Other arrangements, such as non-orthogonal multi-wall junctions, still render as their union. They are flagged only when face ownership is ambiguous.

### Picking

A ray hit on RealAllWalls maps back through face provenance to the RealWall and authored wall that own the face. A hit on a top cap inside a shared band selects the wall of the moving or most recently selected area.

### Thickness rule

For two parallel walls overlapping by depth `d`, the merged thickness is `tA + tB - d`. At full overlap, `d = min(tA, tB)` and the result is `max(tA, tB)`. This is a geometric result, not a property change. Angled junctions use the actual union, not this formula.

## Openings and host depth

- A door or window has exactly one host wall: the one it was placed on, in that area's tree.
- Its aperture cuts through the **full local depth of RealAllWalls**, so the neighbor's band cannot refill it. Its fitted depth equals that effective depth.
- The neighboring room sees the cut. A reference to the opening in the neighbor's tree is optional.
- Overlapping openings from both sides are flagged as a conflict and never merged automatically.
- An opening that no longer fits is kept, flagged, and not cut ([materials and objects](materials-and-objects.md#4-wall-children-wallable)).

## Performance

Recompute only the affected height bands and neighbors after a committed edit, never per frame. Implementation: per-area geometry is memoized by input identity. The local union and RealWalls are keyed by the area's `shapes` and `walls` arrays, so a rigid move only re-places them. Each height slice's footprint is cached by a content signature of its bands and cuts, so an edit recomputes only the slices whose inputs changed. Drag previews may use a cheaper approximation, such as the RealWalls drawn without merging, but the committed result and outputs must agree. Stale asynchronous results never replace a newer scene.

## Verification scenarios

- Two 200 mm walls at Full clash render one 200 mm wall with Room A's and Room B's interior materials on the correct sides.
- Two 200 mm walls at Touching give a 400 mm band and omit only the contact face.
- A 200/400 mm pair gives 600 mm at Touching and 400 mm at Full clash, with either area moving. Both room interiors stay clear, and the source thicknesses are unchanged.
- A partial 100 mm overlap of 200 and 400 mm walls gives a 500 mm band over the common span.
- Rotating an area snaps to a neighbor's wall angle; a Nudge drag by a wall edge then snaps it flush onto the neighbor's edge. Undo restores the previous position in one step.
- Intruding arrangements (pushed past Full clash, or an inner → inner tuck) are allowed, flagged, and fixed by "snap to shared wall".
- Partial-height contacts keep stepped tops; a real gap stays visible; point contact removes no face.
- Moving rooms apart restores the separate surfaces, materials, and IDs.
- With Magnetic off, numeric placement still merges walls that actually overlap. Snapping never changes typed dimensions.
- Openings are not refilled by the neighbor's band; duplicate openings are flagged.
- UV scale and material ownership survive merging and batching in the preview, renders, and exports.
