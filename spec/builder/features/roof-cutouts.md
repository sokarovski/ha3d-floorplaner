# Sloping roof cutouts and open-top visualization

Updated: 2026-11-18.

Status: **superseded by [roofs](roofs.md) in Phase 19.2** (owner 2026-11-18: roofs replace the roof-cut tool). This page keeps the history and the rules that still hold.

## What replaced the roof cuts

Phase 2 roof cuts (`floor.roofCuts`, `rc_` IDs) were half-space modifiers: a measured side profile (section direction, low and high points) extended across the whole floor, the walls kept below the lowest active cut. Since house schema version 6 a floor's **roof** in Cuts walls mode limits its walls instead, each planar piece over its own plan region, and its walls can rise to it ([the roof cuts walls](roofs.md#the-roof-cuts-walls)). The roof-cut tool, the Roof cuts tree row, the side-profile popup and the vertical-profile warning are removed. Existing cuts were converted once into a roof that reproduces their lower envelope, so the walls keep the same heights ([migration](roofs.md#migration-of-roof-cuts)).

## Rules that still hold

- **No ceilings.** Floor and room views never draw a ceiling or a roof (the roof is drawn only in the whole-house views and while editing it, owner decision 4 of Phase 19); cut wall tops are narrow faces in the house cap material, never a plane spanning a room.
- **Non-destructive.** Authored walls, heights, openings and object identities are kept; the trimmed (and risen) walls are derived from them and the roof, and removing the roof gives the authored walls back.
- **Flag, don't clip, items.** Objects, lights and stairs above the underside are flagged, not clipped; doors and windows are clipped with the wall and flagged ([window limit](roofs.md#window-limit)).
- **Virtual overhead references.** Pendant lights and other overhead objects keep their flat virtual overhead reference (the area's tallest authored wall); it does not follow the slope.
- **Exports.** Rendered images and derived geometry reproduce the clipped walls exactly as the views do.
