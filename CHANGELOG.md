# Changelog

## 0.1.3

- Settings in the viewer are now tabs at the bottom: **House** (the things in your house, saved with Save), **Floor planners**, **Houses** and **Panels** (these apply at once). Fields use Home Assistant's own controls.
- **Floor planners:** a list of the floor planners Home Assistant knows, with a default (the star); add, open, make default or delete one. A Homeplan app that announces itself is always listed.
- **Houses:** organised by where each house comes from: the connected floor planner, Home Assistant's own copies (with their source, Upgrade from that source, Download and Remove copy), and the houses of the other floor planners not copied yet. Download a house as a .zip, or upload one.
- **Upload house** in the builder, next to New house: a house .zip downloaded from Home Assistant becomes a new house; if the name is taken, you choose a new one (a numbered name is suggested).
- **Panels:** the panel in use, the previous one, the shipped one and an offered newer one, and a choice of **renderer for this device**: Dithered (with how much of the other rooms stays visible), See-through, Low power, Rooms always fully visible, and Only the open room, each with what it is best for.
- **Shown when** on a light now hides it completely (not just off), and a condition can be **Always** or **Never** without an entity.
- Taps, holds and double taps on things with an entity follow Home Assistant's defaults (a light toggles, most others open their details); Settings shows them as "Default (…)".
- Faster switching between floors and back to the whole house: after a house loads, the viewer prepares the other views in the background, so the first switch no longer pauses to prepare.
- Fixed: opening a room while the furniture was still loading could leave some pieces missing.

## 0.1.2

- Faster viewer, especially on phones: opening a room no longer rebuilds walls or creates faded copies of materials; the other rooms fade with a fine pixel pattern instead. This fixes the browser breaking when zooming into a room on some phones.
- Floor switching keeps every floor's walls loaded once and rides the camera past the real floors, without drawing a copy of the floor you left. The new floor's furniture loads after the ride, a few pieces at a time, with the loading bar.
- Fixed: at night, light from a lit room no longer leaks into a dark room next to it along the corners where walls meet (in the viewer and the builder).
- Fixed: a tapped object no longer shows a stray outline box somewhere else in the view, and a bubble on an object now sits right above it.
- The glass reflection under the house is off, which makes every frame about three times cheaper to draw.

## 0.1.1

- Fixed: the builder no longer stops with "crypto.randomUUID is not a function" when Home Assistant is opened over plain http. Request IDs and retry checks now work without a secure (https) connection.

## 0.1.0

- First release: the Homeplan app (Floor Builder in the Home Assistant sidebar, with three demo houses) and the Homeplan integration (the 3D viewer panel with live devices).
