# Changelog

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
