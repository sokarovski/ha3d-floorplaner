# Stairs and floor openings

Updated: 2026-11-19.

Status: Phase 16.14 (owner decisions, 2026-11-18). Stairs are ordinary objects placed in any room, and floors are cut automatically by a derived step. This replaces the Phase 2–5 **staircase area** (an area whose `kind` was `staircase`, with an opening footprint and one fitted stair instance); see [history](#history). The file keeps its name so existing links stay valid. Field names match `shared/domain/schemas/instances.ts`.

## Stairs are objects

A **stair** is an Areable object in `area.objects` whose template has the `Staircasable` contract. It is added from the room's + menu (**Staircase…**, a picker of the stair templates), placed at the room's centre with the template's default size (straight: 1000 × 2800 mm), then moved and rotated like any object (Move, Rotate, typed values, the property panel). It can stand in any room; there is no room type for stairs.

| Field | Meaning | Default on insertion |
| --- | --- | --- |
| `floorCut` | `"stair"`: what this object cuts (set from the template's contract; read-only, hidden) | `"stair"` |
| `cutFloorAbove` | **Cut floor above**: every other floor whose slab band the stair's height span crosses gets a hole (the floor its top reaches, and any floor it passes through) | on |
| `cutFloorBelow` | **Cut floor below**: the floor the stair stands on gets a hole (a stair going down, e.g. into a basement) | off |
| `parameters.widthMm`, `parameters.depthMm` | plan size: width across the flight (template x) and run length (template z) | template defaults |
| `parameters.totalRiseMm` | rise (template y) | the gap to the next floor above (finished floor to finished floor), within the template's limits; the template default without a floor above |
| `positionMm`, `rotationDeg`, `elevationMm` | ordinary Areable placement: the plan centre of the footprint, heading, base above the floor | room centre, 0°, 0 |

- **Rise suggestion:** applied once at insertion (`stairRiseSuggestionMm`, `shared/domain/house/stairs.ts`); later floor moves never change a stair. It stays editable.
- **The switches** are instance fields (the same for every stair template) shown in the **Staircase** group while `floorCut` is `stair` (`visibleWhen`); the template's own parameters (Steps, Width, Run, Total rise) stay in its Template group (D18).
- A stair renders as its template, as any object. Its own floor stays solid under it unless **Cut floor below** is on.

## Floor openings

A **floor opening** is the floor counterpart of a wall opening: an Areable object, added from the room's + menu (**Floor opening…**), that cuts the floor it stands on and its slab by its own outline (hatch, light well, atrium, a hole kept for later stairs). Built-ins: **Floor opening** (rectangle, `floor-opening`, 1000 × 1000 mm) and **Round floor opening** (ellipse, `floor-opening-round`, ⌀ 1000 mm), with `widthMm` and `depthMm` size parameters (D17/D18). Each draws a 30 × 15 mm edge trim just inside its outline so it can be seen and picked; the hole itself is the cut.

| Field | Meaning |
| --- | --- |
| `floorCut` | `"opening"` (set from the template's `floorCut` metadata; read-only, hidden) |
| `floorCutShape` | `"rectangle"` (absent) or `"ellipse"`, from the template's `floorCut.shape` |

A floor opening only cuts its own floor. It has no switches.

## Template contract

- `Staircasable`: hosted by the floor (`attachment.hosts` includes `floor`; the legacy `staircaseArea` host is read as the floor). Its x, y and z axes have the size parameters `widthMm`, `totalRiseMm` and `depthMm`, so the cut and the rise are known from the instance alone (as wall openings use `widthMm`/`heightMm`, `openingSizeFromParameters`). Its footprint is a rectangle.
- A **floor-opening** template is an `Areable` with `kind: "floorOpening"` and `floorCut: { shape: "rectangle" | "ellipse" }` in its metadata, hosted by the floor, with x and z size parameters `widthMm` and `depthMm`.
- `validateTemplateMetadata` enforces these rules; `floorCut` is refused on a Wallable.

The built-in stairs: **Straight Staircase** (`widthMm` slice 600–2000 (1000), `totalRiseMm` scale 1000–6000 (2700), `depthMm` scale 1000–8000 (2800), Steps 3–30 (15)) and **L-Shaped Staircase** (`widthMm` and `depthMm` slice 1500–6000 (2860 × 2860) with the flight width band `flightWidthMm` 600–2000 (900), `totalRiseMm`, Steps). The steps stretch with the run (D17 resize rules).

## Automatic cutouts

Implementation: `shared/geometry/floorCuts.ts`, a derived pre-render step (never persisted) run whenever a floor's RealFloor and slab are built with its house.

1. **Cutters:** every object with `floorCut` on every floor of the house given, except saved-Hidden ones and those in Hidden rooms (the HA viewer never draws them); on the floor shown, the builder's floor view also leaves out session-hidden ones. Its footprint is the rectangle (or ellipse, 48 segments) `widthMm × depthMm` centred at `positionMm`, turned by `rotationDeg`, composed area → floor → house through the area's placement and the floor's placement (`floorToHouseOffset`, 16.2). A stair's height span is its floor's elevation + `elevationMm` up to that + `totalRiseMm`.
2. **What cuts floor F** (elevation e, slab thickness t, slab band e − t … e):
   - floor openings placed on F;
   - stairs on F with **Cut floor below**;
   - stairs on any other floor with **Cut floor above** whose span crosses F's band: the span's bottom is below e and its top reaches the band's underside e − t (1 mm tolerance). This covers the floor above, a stair down into a basement placed in the basement, and a tall stair passing through a floor.
3. **Subtraction:** the union of the cutters, moved into F's local frame, is subtracted from every area's RealFloor (so room floor surfaces and carpets, which are clipped to RealFloor) and from the slab's coverage (`buildRealFloors(floor, cuts)`, `buildFloorSlab(floor, cuts)`). The slab shows its material on the hole edges.
4. **Caching:** `floorCutsOf(house, floorId)` returns the region with a signature of its cutters; RealFloor and slab caches key on that signature, and the floor scene rebuilds a floor's surfaces when it changes, so moving a stair, changing its size, rise or switches, or moving or raising a floor rebuilds the affected floors even when their own document did not change.

Callers without a house (a floor on its own: snaps, outlines) get the uncut floor.

## Migration of staircase areas

House schema version 5 (`migrateV4Stairs`, `shared/domain/house/migrateV4Stairs.ts`) converts every staircase area once, on load:

- **Box:** the opening's axis-aligned bounds in the area frame; the stair's width is the short side, its run the long side, its heading the old fit's climb (Run, else the nearer direction to the old rotation), its centre the box centre (Phase 5.2 side-by-side lanes: the up lane's centre and half the short side).
- **Up, or Up and down:** a stair object (the staircase instance's ID, template, version and parameters kept, `totalRiseMm` kept; `widthMm`/`depthMm` from the box, the L template's flight width from its old width) with Cut floor above on.
- **Down, or the down part of Up and down:** dropped when a migrated stair on another floor with Cut floor above crosses this floor's slab band and overlaps the opening (the stair below now cuts it); otherwise a **floor opening** of the box is added (ID `o_` + the area ID's suffix), so no hole is lost. An opening without a stair instance becomes a floor opening.
- **Host room:** the other area on the floor that overlaps the opening most, else the nearest one (by box centre); positions and headings are re-expressed in its frame. A staircase area with walls, objects, lights or carpets is kept as an ordinary room and hosts the result itself; otherwise it is removed. With no other area, the staircase area is kept as a room.
- Every area loses `kind` and `staircase`.

**Home Assistant copies:** copies stored before version 5 stay valid. The integration validates stored and incoming documents against `StoredHouse` (version 4 or 5, `shared/domain/schemas/storedHouse.ts`, generated into `custom_components/homeplan/schemas.json`), and the HA viewer migrates every loaded document with the same `migrateHouseDocument` before rendering (`readStoredHouseEnvelope`, `shared/domain/house/readStoredHouse.ts`). The builder always exports the current version.

The opening box can be larger than a non-rectangular opening; the new hole is then the box.

## Editor behavior

- The room's + menu offers **Staircase…** and **Floor opening…** beside Object… and Light; a stair or opening is a row in the room's Objects folder (stairs with the stairs icon).
- Selecting a stair shows General, Placement, Staircase (Cut floor above, Cut floor below), Template (its parameters) and Appearance; a floor opening shows the same without Staircase.
- The tree has no Opening or Staircase rows and rooms have no type selector; a room's Floor row always offers Carpet.

## Direction and fitting

History only (Phase 3–5.2): staircase areas had a direction (up, down, both), a layout and a run, and the stair was fitted to the opening's box. Migration maps them as [above](#migration-of-staircase-areas); `staircaseFit.ts` and `staircaseOpenings.ts` are removed.

## Verification scenarios

Checked by `npm run stairs:check` (`scripts/check-stairs.mjs`):

- A stair with Cut floor above on the floor below cuts the floor above at the right place when the two floors have different plan offsets; its own floor stays solid.
- Cut floor below cuts the stair's own floor; both switches off leave no hole.
- A floor opening cuts its own floor's RealFloor and slab; the round one cuts an ellipse.
- A tall stair passing a floor cuts it and the floor its top reaches; a short stair that stops below a slab cuts nothing.
- Migration of an up staircase area below and its matching down area above gives one stair, a hole above, and no floor opening; a down area with no stair below becomes a floor opening; staircase areas and `kind` are gone and the result validates.
- `templates:build` validates the stair and floor-opening templates (metadata rules and the resize round trip).

## History

Phase 2 introduced staircase areas (an opening footprint, no floor surface, one `Staircasable` instance); Phase 3 added up/down and fitting; Phase 5.2 added up-and-down, layout and run; Phase 16.2 made Down and Up-and-down openings holes in the slab. Phase 16.14 replaced the model with stair objects and automatic cuts.
