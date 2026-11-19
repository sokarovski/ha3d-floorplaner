# Coordinates and units

All lengths are millimetres, regardless of display units. Angles are degrees. Floor-plan x points right and y points up in Top view; elevation is measured above the active floor's finished plane. Floors are independent; switching floors does not stack them.

A room has a floor-local `positionMm` and `rotationDeg`. Footprint pieces, objects, lights, and carpets have positions local to that room. A carpet's footprint pieces are local to the carpet. Moving/rotating a room carries its contents. A positive plan rotation turns counterclockwise.

Rectangle `positionMm` is its centre. Agent shape input uses `widthMm` and `depthMm`; the authoritative stored rectangle schema calls depth `heightMm`. Therefore use `heightMm` when editing an existing rectangle through `set_properties`. Circle positions are centres. Polygon vertices are local offsets from the shape position, before its rotation. The creation wrapper checks crossings and normalizes vertex winding to counterclockwise.

A 4000 × 3000 rectangle centred at zero covers x = −2000…2000 and y = −1500…1500. With outside-aligned walls of thickness 200, a second identical room centred at x = 4200 has a 200 mm gap between its measured interiors, where their shared wall can overlap. Check `get_geometry` after arranging rooms. Do not assume that touching interior outlines is the same as aligning wall faces.

Walls anchor to stable source-shape edges. Rectangle edge keys are bottom, right, top, left; circle edges use arc; polygon edges reference stable vertex IDs. Prefer dimension edits through `set_properties` when preserving edge identity matters. Replacing a polygon generates new vertex IDs and can orphan existing walls; inspect geometry and repair/delete affected walls deliberately.

Openings use `distanceAlongWallMm` measured from the wall span's start to the opening centre, plus `bottomMm` above the floor. Object/light elevations are room-local above the floor. Template dimensions and attachment rules come from `get_template`; never invent asset IDs or use pixel coordinates as millimetres.
