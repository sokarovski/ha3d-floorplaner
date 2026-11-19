# Yards: lawn, fences, gates, and pathways

Updated: 2026-11-18.

Status: implemented (Phase 17.2). Owner requirements (2026-11-18) are marked as such; the rest are resolved review inferences or implementation conventions, labelled where they matter.

## Owner requirements

- A yard is another kind of area. Its type lives on the model only: it is set when the yard is created, and the UI has no type selector.
- A yard is created only by **Add yard** in the ground floor's **+** menu in the house tree, as a default rectangle, and is then edited with the normal Room Editor shape tools.
- Instead of a floor surface a yard has grass: its flooring starts as the built-in **Lawn** and stays changeable like any flooring.
- Instead of walls a yard has repeatable glTF fences along its edges: wooden picket, metal panel, and hedge (bush fence, about 1.0–1.6 m tall, height adjustable).
- Owner addition (2026-11-18, alongside Phase 19): add 2–3 garden fence styles and improve the cardboard-like hedge. Implemented styles are horizontal timber slats, diamond timber trellis, and green welded wire mesh; the hedge now uses dense, uneven foliage and individual folded leaves.
- Gates go where a door would go.
- The slab cuts the yard out: a yard has no slab.
- A yard is outdoors for lighting: it is not part of the indoor mask and has no shadow-only ceiling.
- In the tree a yard shows like a room, with a yard icon.
- Pavement pathways work like carpets: drawn shapes inside the yard with their own material (default built-in **Paving**), using the carpet mechanism.

## Model

| Field | Value | Default (absent) | Edit |
| --- | --- | --- | --- |
| `area.kind` | `"yard"` | absent: a room | set by Add yard only; read-only and hidden in the panel |
| `area.fence` | `picket`, `panel`, `hedge`, `slatted`, `trellis`, `wire` | `picket` | panel (**Fence**, shown for yards only through `visibleWhen kind = yard`) |

Both fields are optional ([area schema](../../../shared/domain/schemas/area.ts)), so existing houses stay valid and no migration or schema version change is needed (house schema version 5). The `kind` removed in version 5 was a different, required field (room or staircase); the migration of version 4 documents is unchanged.

Everything else is an ordinary area: floor shapes, flooring material, walls, objects, lights, carpets, Hide and Hidden, move and rotate, duplicate and delete.

### Fences are wall entries

Decision (review inference, 2026-11-18): a yard's fences are its ordinary **wall entries** (`area.walls`), not a separate collection or a fence derived from every edge.

- Each fence keeps the wall's source edge, span (trim, extend, split, and the end lines work as for walls), height (= the fence height), thickness and alignment (the band the fence stands in), and Hidden.
- An edge without a wall has no fence, so a yard edge against the house is simply left without one.
- Gates are the wall's `objects` (`Wallable` instances), so the opening machinery (placement along the wall, width, flips, the template picker, tree rows, deletion, undo) is reused unchanged.
- The yard's `fence` style applies to all its fences. A per-wall style is not provided (limit, below).
- Wall materials have no effect on a fence: the fence template keeps its own finishes (limit, below).

A derived fence along every edge was rejected: it would need its own editing for open edges and its own gate mechanism.

## Adding a yard

**Add yard** is an item of the ground floor's **+** menu (next to Area). The **ground floor** is the lowest building floor by elevation, ties going to the first in the document (`groundFloorOf`, `shared/domain/house/yards.ts`); other floors do not offer it, and `addYardCommand` refuses any other floor.

Placement (implementation convention):

- The new yard (`Yard N`) is an 8 × 6 m rectangle placed against the south (−y) side of everything on the floor (the RealFloor solids of its rooms and yards, walls included), centred on them in x.
- When the floor's southmost area is a room, the yard's north edge lies against the house and gets no fence; it gets three fences. When another yard is further south, the new yard is fenced on all four sides.
- On a floor without areas it is centred on the view and fenced on all four sides.
- Fences start 1000 mm high, 100 mm thick, inside-aligned (within the yard outline), with the picket style. Flooring is the built-in Lawn (`builtinimg_lawngrass`).
- The yard is selected after it is added; one undo step removes it.

## Pathways

A pathway is a carpet in a yard (`area.floor.carpets`, the `Floorable` contract), so it is drawn, clipped to the yard's RealFloor, and edited with the Carpet Editor exactly as a carpet. In a yard the Floor row's **+** menu offers **Pathway** instead of Carpet (`addPathwayCommand`): `Path N`, a 1200 × 4000 mm rectangle at the yard's centre in built-in Paving (`builtinimg_paving`). The command refuses rooms. There is no separate pathway type in the model.

## Derived geometry

All of this is derived and never persisted ([geometry groups](geometry-groups.md#authored-guides-and-derived-geometry)).

- **RealFloor (the lawn):** the yard's floor shape (its inside-aligned fence bands lie within it), minus the RealFloor solids of the floor's rooms (`buildRealFloors`), so a yard drawn around or against the house never lies under or over a room floor or its walls. Floor cuts subtract as for any area.
- **Slab:** yards add no slab coverage (`slabCoverage`, `shared/geometry/floorSlab.ts`). A floor with only yards has no slab.
- **RealAllWalls:** yard walls take no part ([shared walls](shared-walls.md#building-realallwalls)): they are not merged with the house's walls, their gates cut nothing, and neither raise intrusion or opening issues.
- **Tallest wall:** yard fences do not count for the suggested elevation of a new floor (`tallestWallMm`).

### Fences

`yardFenceSegments` (`shared/geometry/yardFences.ts`) turns each straight fence wall into fence segments:

1. The stretches of the wall are its pieces (its span on the yard outline) minus each gate's width at its place (`distanceAlongWallMm` ± `widthMm / 2`). Stretches shorter than 50 mm are dropped (implementation convention).
2. Each stretch is one instance of the yard's fence template: x size = the stretch length, y size = the wall height (both clamped to the template's limits), standing on the floor (bottom contact, h = 0) at the middle of the stretch on the band's middle line, facing into the yard.
3. Segment IDs are `<wallId>~fence~<index>`; the instance layer resolves a pick on a fence to its wall.

Curved walls carry no fence (like openings, D20). A hidden fence wall draws no fence.

### Fence and gate templates

The built-ins are generated by `npm run templates:build` from `scripts/templates/fences.ts` and `gardenFences.ts`, with hedge geometry in `fenceFoliage.ts` ([object templates](object-templates.md#built-in-catalog)). A fence segment is an `Areable` of kind `fence` (no picker offers it). Its repeat unit repeats along x by a count formula from `widthMm` (the D17 counted repeat). Dependent rails `extendsWith` it, end posts `follows` it, and every part stretches with the `scale` axes, so the grown asset maps exactly to the stretch. Multi-material panels and hedge runs repeat one merged mesh per finish/part, rather than one scene object per board, wire, or leaf.

| Template | Unit | Default | Height range |
| --- | --- | --- | --- |
| `fence-picket` (Picket Fence) | 5 pickets every 140 mm = 700 mm, two rails, end posts | 2100 × 1000 mm | 400–2000 mm |
| `fence-panel` (Metal Panel Fence) | one 2000 mm welded panel with its post | 2000 × 1200 mm | 600–2500 mm |
| `fence-hedge` (Hedge) | 1000 mm of overlapping foliage clumps, up to 600 folded leaves in three green tones, and woody stems | 2000 × 1300 mm | 600–2500 mm |
| `fence-slatted` (Horizontal Timber Fence) | 2000 mm panel of bevelled horizontal boards, alternating timber tones, dark posts/supports, and fixings | 2000 × 1700 mm | 600–2500 mm |
| `fence-trellis` (Diamond Timber Trellis) | 2000 mm framed diamond lattice; crossing battens occupy separate depth layers and are clipped to the frame | 2000 × 1600 mm | 600–2400 mm |
| `fence-wire` (Wire Mesh Fence) | 2000 mm green welded mesh panel with 100 × 150 mm openings, rails, slender posts and clips | 2000 × 1300 mm | 500–2500 mm |
| `gate-picket` (Picket Gate) | `Wallable`, kind `gate` | 1000 × 1000 mm | 600–2500 mm |
| `gate-panel` (Metal Panel Gate) | `Wallable`, kind `gate` | 1200 × 1200 mm | 600–2500 mm |

The number of units is the stretch length divided by the unit, rounded, and at least one. A unit therefore keeps nearly its own size, and a long fence is a few meshes rather than one per picket.

Hedge conventions (owner appearance fix, 2026-11-18): seeded metre runs, 24 overlapping irregular foliage clumps (80 triangles each, with smooth normals and three subtly different green finishes), up to 600 small four-triangle folded leaves per metre, and a few tapered stems. Leaves are distributed on the exposed clump union, including its top and cut ends, instead of buried inside overlaps. Four merged meshes per metre (three foliage finishes and stems), around 8700 triangles and 447 kB for the default two-metre template. No flat box body, texture downloads, alpha cards, animation, or renderer special case. Existing `fence-hedge` v1 is rebuilt in place, following earlier built-in appearance fixes, so existing hedges get the improvement. New styles are additive enum choices; existing houses need no migration. Their mesh/material counts stay bounded by panel/run count, not leaf count. Appearance was checked in an isolated Three.js preview; performance on a large garden/tablet remains an owner check.

A yard wall's **+** menu offers **Gate…** only: the gate picker lists the kind `gate` templates. Door and window pickers do not list gates, and the object picker does not list fences. A gate is placed in the middle of the wall at its template's default size, and the fence leaves its width open.

## Rendering

The shared renderer (`src/renderer/`) draws yards the same way in every view:

| View | Lawn and pathways | Fences and gates |
| --- | --- | --- |
| Builder floor view and Room Editor | floor scene | instance layer (fences hide with Walls off, like walls) |
| Builder whole-house overview | floor scene | each floor's instance layer, which draws all of its content, fences included (Phase 18.1) |
| HA floor and room views | floor scene | instance layer; fence templates load with the house model (house lane), like doors and windows |
| HA whole house | floor scene | each floor's instance layer, which draws all of its content, fences and gates included (Phase 18.1; 17.2 drew only these); the framing includes the fences |

Lighting: a yard has no shadow-only ceiling (`floorScene.ts`), so it is never in the indoor mask (`indoorRooms`) and gets sky and sun light like the outdoors ([sky light](lighting.md#sky-light-through-windows-phase-155)).

## Tree and panel

- A yard row has the yard icon and the area's rows: **Floor** (whose **+** offers Pathway), **Fences (n)** (one row per fence, named `Fence (bottom)` etc., each **+** offering Gate…), objects, and lights. Gates use the gate icon.
- A yard's **+** offers Object… and Light; it offers no Staircase… or Floor opening… (a yard has no floor above or below to cut).
- The panel titles a selected yard **Yard** and shows its Fence style; the Flooring group is the floor's material as for any area.

## Home Assistant

The HA viewer shows yards in the whole-house, floor, and room views. A yard can be opened like a room. The HA integration validates house documents with `schemas.json`, which `npm run build:ha-viewer` regenerates. An installed integration from before Phase 17.2 refuses a house with a yard (`kind` and `fence` are unknown properties there), so it needs a **reinstall**; houses without yards are unaffected. The three additional fence styles also require regenerated integration schemas and bundled built-in templates before a house using them is transferred; they use the same generic fence rendering path.

## Limits

- One fence style per yard; no per-wall style and no mixed hedge and picket in one yard.
- Fence finishes come from the template (no wall material, no material override of a fence).
- Fences on curved edges are not drawn.
- A gate does not open or animate; it has no open-angle parameter.
- Fences follow the wall height; a wall height outside the template's range is clamped for drawing.
- Corners: two fences meet with their end posts overlapping; there is no corner post or mitre.
- No terrain: the lawn is flat at the floor's finished floor (h = 0); yards above the ground floor are not offered.

## Verification

`npm run yards:check` checks the schema, Add yard (ground floor only, placement, Lawn, open edge against the house), Add pathway, the slab and RealAllWalls without yards, the lawn clipped by the rooms, fence segments and gates, the templates' repeat counts and exact sizes, the instance layer (fence picks resolve to the wall, Walls off), the indoor mask, the whole-house exterior, and the tree. The demo house "Demo: Garden bungalow" has a hedge yard with a picket gate and a paved pathway (`scripts/fixtures/demoHouses/gardenBungalow.ts`).
