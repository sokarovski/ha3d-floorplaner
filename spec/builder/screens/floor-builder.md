# Screen 2: Floor Builder

Updated: 2026-11-18.

Status: owner requirements, with defaults resolved in [D04](../../decisions.md#d04-footprints-walls-and-stable-boundaries), [D05](../../decisions.md#d05-walls-between-adjacent-areas), [D14](../../decisions.md#d14-project-management-and-names), [D16](../../decisions.md#d16-interaction-defaults-and-support-limits), and [D21](../../decisions.md#d21-wall-reliefs). Describes the app as built; owner decisions from the Phase 3, 4, and 5 feedback rounds are written in here. Visual design details are left to implementation.

## Entry and empty-house behavior

Selecting a house on the [Houses screen](houses.md) opens the Floor Builder for that house through SPA navigation.

The house's immediate model children are floors. Every house has at least one: a new house starts with `Etage1`, and the last floor can't be deleted. Floor naming follows [D14](../../decisions.md#d14-project-management-and-names).

All floors are stored in the house's single `house.json`, each with a stable ID and its name as a property. See the [floor data model](../model.md).

## Screen layout

- **Header:** back to Houses, the house and floor names, the current [editing level](#editing-levels), the editor bar (breadcrumb and Done) while a room is open, and the [header controls](#header-controls).
- **Left toolbox:** a vertical panel of tool icons floating over the viewport's left edge, showing only tools relevant to the active editing level, with the camera buttons pinned at its bottom.
- **Main viewport:** the [whole-house overview](#whole-house-overview) of a multi-floor house (every floor stacked, Phase 16.4), or the active floor in its overview or one of the nested editing levels. Inside a floor only that floor is shown. The roof-cut workflow (Phase 2) edits its slope in an aligned vertical side-profile popup.
- **Upper right panel (House):** a tree of the house, floors, areas, and their parts. It has no visible “House” heading: the first row is the house itself, by name (Phase 16.5); the panel keeps “House” as its accessible name.
- **Lower right panel (properties):** properties of the current selection, generated from its type's property schema ([property system](../property-system.md)), followed by its warnings, derived facts, and [selection actions](#selection-panel-and-actions). Selecting a different item updates this panel.

The two right panels are stacked vertically in a 25 rem column; the viewport and panels reach the window's bottom, and status notices float over the viewport ([status bar](#status-bar-and-notices)). The layout is desktop-only (minimum 1280 × 720); panel sizing is a visual-design detail.

Implement the layout and controls through the shared [design system](../../design-system/README.md): typed React components, data-attribute styling, `.tw.css` files, semantic theme tokens, and Light/Dark/Auto settings. Keep generic components separate from feature-specific tool relevance and model properties.

### Context-aware vertical toolbox

Determine tool relevance from the active [editing level](#editing-levels). Recompute the visible tools when that level changes. Irrelevant tools are hidden rather than filling the toolbox with unrelated disabled icons.

The toolbox today (owner, Phase 4 G8 and Phase 5; sections are separated by a line, `│` below; shortcut in brackets):

| Level | Tools |
| --- | --- |
| Whole house (multi-floor houses, Phase 16.4; one-floor houses with a roof, Phase 19.1) | Select (Space), Nudge (M) │ Orbit (O), Pan (H) |
| Roof (Phase 19.1, [roofs](../features/roofs.md#the-roof-editing-level)) | Select (Space), Move (M), Line (L) │ Rectangle (R), Circle (C), Polygon (P): a new outline │ Orbit, Pan |
| Roof face (Phase 19.3, [roof face view](../features/roofs.md#the-roof-face-view)) | Select (Space), Move (M) │ Rectangle (R), Circle (C), Polygon (P): a hole, Roof window (W) │ Pan |
| Overview | Select (Space), Nudge (M), Rotate (Q) │ Tape (T) │ Orbit (O), Pan (H) (the Phase 2 Roof cut tool was removed in Phase 19.2: roofs replace it) |
| Room Editor | Select, Nudge, Rotate (Q) │ Corner edit (V), Rectangle (R), Circle (C), Polygon pencil (P) │ Push/pull (U), Trim/extend (E), Split (S), Fill walls (W) │ Tape (T) │ Orbit, Pan |
| Carpet Editor | The Room Editor's tools without the wall section |
| Wall face view (no feature open) | Select, Nudge │ Rectangle, Circle, Polygon │ Push/pull (feature depth) │ Pan |
| Feature Editor | Select, Nudge │ Corner edit, Rectangle, Circle, Polygon │ Pan |

Every level ends with **Magnetic** and **Auto-select** after a separator, and a pinned footer with the [camera buttons](#camera-controls-and-view-choices). Roof slopes are edited in the roof's own editing level ([roofs](../features/roofs.md#the-roof-editing-level)). Placing a template instance (object, door, window) starts from the tree's [Add menus](#adding-children-from-the-tree), not from a toolbox tool. Dimensions and template parameters remain in the right properties panel; the left toolbox selects actions/tools.

Icon behavior: readable tooltips and accessible names, visible active-tool state, and consistent placement for shared tools. Context-specific options may use an adjacent flyout; preserve Magnetic and the independent Auto-select toggle. Its exact icon/flyout presentation remains to be designed.

Entering or leaving any editing level resets the tool to Select. If the active tool becomes inapplicable after a context change, cancel its partial operation (never silently commit it), keep valid selection, and return to the selection tool.

## Editing levels

The builder has nested editing levels, each entered with a double-click one level deeper (SketchUp's nested groups; owner, Phase 5). The header names the level and, inside a room, shows a breadcrumb whose parts are links back up, plus **Done** (one level up). Committed edits are kept on every exit; each edit is its own Undo step.

| Level | Enter | Leave (one level up) | Header |
| --- | --- | --- | --- |
| **Whole house** (multi-floor houses only) | Opening the house; selecting House in the tree; leaving a floor | — | "Whole house" |
| **Overview** (of one floor) | Opening a one-floor house; double-click a floor in the whole house, or double-click/Enter its tree row | Multi-floor houses: Done, Escape, the House link, or a double-click on empty space: back to the whole house with the floor selected | "Overview"; multi-floor: "Editing House › Ground" |
| **Room Editor** | Double-click a room in the view, or double-click/Enter its tree row | Done; double-click outside the room (another room or empty space) | "Room Editor", "Editing room Living room" |
| **Carpet Editor** | In the Room Editor, double-click a carpet; from anywhere, double-click/Enter its tree row (opens its room first) | Done, the room link, or a double-click more than 12 px outside the carpet's box: back to the Room Editor with the carpet selected | "Carpet Editor", "Editing Living room › Rug 1" |
| **Wall face view** | In the Room Editor, double-click one of the room's straight walls; or double-click/Enter its tree row | Done, the room link, or a double-click off the wall: back to the Room Editor with the wall selected | "Wall face", "Editing Living room › Wall (bottom) (interior)" and **Show exterior / Show interior** |
| **Feature Editor** | In the face view, double-click a feature; double-click/Enter its tree row; or Add → Feature on the wall row | Done, the face link, or a double-click more than 12 px outside the feature: back to the face view with the feature selected | "Feature Editor", "Editing Living room › Wall (bottom) (interior) › Feature 1" |
| **Open object group** | In the Room Editor, double-click a member of an [object group](../features/object-groups.md) | Done, Escape, the room link, or a double-click away from the group: the group is selected again | "Group Editor", "Editing Living room › Dining set" |
| **Roof** (Phase 19.1) | In the whole house, double-click the roof; or double-click/Enter its tree row (under the top floor); a canopy (19.3) also by a double-click in its floor's view | Done, Escape, the House link, or a double-click off the roof: back to the whole house with the roof selected (a canopy: back to its floor, selected), in the view (3D or Top) the user had before (Phase 19.5) | "Roof", "Editing House › Roof"; opens in Top view; see [roofs](../features/roofs.md#the-roof-editing-level) |
| **Roof face** (Phase 19.3) | Inside a roof's level, double-click one of its faces | Done, Escape, or a double-click off the roof: back to the roof's level (Top view); a double-click on another face opens that one | "Roof face", "Editing House › Roof › Face"; the camera looks straight at the slope; see [roof face view](../features/roofs.md#the-roof-face-view) |

- In the overview, a double-click on a carpet or a grouped object opens its **room** first; a second double-click opens the carpet or group (owner, Phase 5: one level per double-click, so a large rug never hijacks a double-click meant for the room). A double-click on empty space in the overview fits the floor to the screen in a one-floor house; in a multi-floor house it returns to the whole house ([whole-house overview](#whole-house-overview)).
- **Escape**, when nothing else is running, steps out: it first cancels the running operation, then returns to Select, then clears the selection, and only then leaves one level (Phase 7.1, owner 2026-11-16, SketchUp-like; it replaces the Phase 3 rule that Escape never leaves a level). In a one-floor house's overview the last step clears the selection; in a multi-floor house it then closes the floor (whole house, the floor selected), where the last step clears the selection.
- Curved walls do not open a face view; a notice says so.
- The tree is locked to the open room at every level below the overview ([selection, focus, and mode changes](#selection-focus-and-mode-changes)); switching floors returns to the overview.

**One edit path** (Phase 7.1, [edit context](../../../src/features/floor-builder/services/editContext.ts)): the open levels are one ordered path (room, then carpet, group, or wall face, then feature). The session's `focus*` fields are a projection of that path and are written only through it, so a level can never be left half-open. Every level leaves the same way (Done, Escape, a breadcrumb link, a double-click outside), selecting what was open. After every command, Undo, Redo, and revision restore the path is trimmed to the levels that still exist (for example, undoing the creation of an open carpet returns to the Room Editor). The header's breadcrumb is built from the path: every level but the last is a link that jumps there. A tool shortcut for a tool this level does not have shows a notice ("Fill walls is not available in the Carpet Editor.") instead of doing nothing.

## Header controls

From left to right after the title and editor bar (all session-only unless stated). Phase 13.2 (owner, 2026-11-18): the header never grows past the window; the title and editor bar truncate, the tool group scrolls sideways (thin scrollbar) only when the window is too narrow, and Settings and **Save** stay pinned at the right edge, so the page itself never scrolls.

| Control | Behavior |
| --- | --- |
| **Show others** (eye) | Inside a room only: other rooms faded (default) or hidden ([editing focus](#editing-focus-in-room-editor)) |
| **Unhide all (n)** | Only while something is [hidden for the session](#hide-and-hidden): shows it all again |
| **Show hidden** | Only while something is saved [Hidden](#hide-and-hidden) (or the toggle is on): draws saved-Hidden things faded and pickable instead of leaving them out |
| **Walls** | Walls on, or [Walls off](#walls-off) (traced on the floor) |
| **Sun view** | One `IconSelectMenu` (13.2) showing the current choice: **House** (the default: the house's environment location and time), **Day** (a fixed bright sun from the south-east, about 50° up), **Night** (no sun; the sky drops to its night ambient and lamps carry the scene). Session-only; it never changes the house environment. The photoreal render uses the sun as shown |
| **Lights** | One `IconSelectMenu` (13.2) showing the current light-controls choice, tonal while not Hidden: **Hidden / Shown / Focus**, starting on Hidden (owner, Phase 5 follow-up and 2026-11-15). Hidden drops pins and light handles; Shown draws them; Focus dims everything else and makes only lights pickable. After a separator, **Switch all lights off / on** (Phase 7.9): off switches every artificial light off in the view (sun and daylight only); it never changes the saved Enabled of any light. See [lighting](../features/lighting.md#finding-and-picking-lights-in-the-editor) |
| **Effects** | ▶/⏸ toggle next to Lights ([ambient effects](../features/ambient-effects.md), D24): pause hides every effect; play shows them and plays them all once now. Starts paused (no timer, no redraws); the last choice is remembered in this browser (`localStorage` `homeplan.builder.effectsOn`, owner 2026-11-17) |
| **Top / 3D** | View choice ([camera controls](#camera-controls-and-view-choices)); the builder opens in 3D |
| Undo / Redo | Tooltips name the step ("Undo: Move area"); ⌘Z / ⇧⌘Z ([undo/redo](../undo-redo.md)) |
| History | The house's Git revisions: browse, compare, Save with a note, and Restore a revision as a new one ([persistence](../../architecture/persistence.md#revision-history)) |
| **Export** (menu) | Render and export merged (13.2): **Export PNG…** (the PNG export form) and **Photorealistic render…** (the [photorealistic render](#optional-main-view-photorealistic-render-mvp-phase-2); overview only, disabled with the reason otherwise or when no backend is configured) |
| Save problems | Only a failed write ("Save failed · retrying" with **Retry now**) or a conflict is shown; the normal states (Writing…, Saved, not saved as a revision) are not (owner, 13.2; [editing lifecycle](../editing-lifecycle.md#undo-and-save-behavior)) |
| Settings | The settings popup ([editor settings](#editor-settings)) |
| **Save** | Creates a Git revision (⌘S). Enabled only when the document differs from the last revision, disabled ("Nothing to save") otherwise; Undo back to the last revision's content disables it again. Content is compared once when the working write settles, never per edit (Phase 14.1) |

**AI agent instructions**, the link to the [browser automation](../../architecture/browser-automation.md) guide (Phase 6), floats at the bottom right of the viewport instead of taking header space (13.2).

Floor and room views use the open-top model: never render ceilings, and a floor's roof is drawn only in the whole-house views and while editing it ([roofs](../features/roofs.md#where-roofs-are-drawn)); its walls are still clipped by it and rise to it (unless a wall's own Rise to roof is off, Phase 19.5). A floor's attached canopies (Phase 19.3) are drawn in its floor and room views too (owner decision 2, 2026-11-19); a selected canopy moves with Move (M) there without entering it (Phase 19.5, [canopies](../features/roofs.md#attached-canopies)). Overhead attachment references can remain virtual.

## Editor settings

Provide settings for a subtle bottom-plane perspective grid and a saved project display/input unit (`mm`, `cm`, `m`, `in`, or `ft`), defaulting to `mm`. Every length property accepts any supported explicit unit and converts it live into the project unit. All model calculations use the confirmed base of one millimeter per internal length unit, including fractions. The grid is an editor helper independent of Magnetic, and changing project units must not resize the scene. See [editor settings](../features/units-and-grid.md) for conversions and preference details; the settings control's placement is a visual-design detail.

Provide central house location and north orientation plus current/fixed render datetime for sunlight. These controls are in the house properties (select the House row). Defaults are London, United Kingdom, on 1 June 2020 at 12:00 London local time; see [house environment](../features/house-environment.md) for timezone, sun direction, and rendering rules.

## Camera controls and view choices

The main view supports orbit/rotation around the home's center, pan, and zoom, following the owner's SketchUp-like navigation reference. Inside a floor, “home center” means the active building floor's center; in the [whole-house overview](#whole-house-overview) it is the center of all floors.

**Viewport layout and camera buttons** (owner, Phase 5 follow-up): the viewport runs under the toolbox, which floats over its left edge; the renderer knows the covered strip, so fitting centres the view in the uncovered part. The view gizmo sits at the viewport's bottom-left, left-aligned with the toolbox, and the toolbox ends above it. The toolbox's tools scroll when the window is short; pinned at its bottom, after a separator, are three camera buttons: **Top (3D)** (a straight-down perspective view with the plan's axes reset, X right and Y up), **Rotate 90°** (a quarter turn about the pivot), and **Fit to screen** (F). Top (3D) and Rotate 90° switch to 3D when needed and then fit.

**Plain colours while editing a room** (owner, Phase 5 follow-up): in the Room Editor (and its Carpet Editor and wall face view) floors, walls, and carpets drop their image textures and show their base colours, which makes shapes easier to draw and see; leaving the Room Editor brings the textures back. Objects keep their own textures, and PNG and render exports always use the textures.

**View gizmo** (owner, Phase 4.6; a rounded square since Phase 5.15; bottom-left since the Phase 5 follow-up): next to Fit to screen, a small orientation tripod shows the floor's red X, green Y, and blue Z axes as seen from the camera (the same colours as inference cues and Shift axis locks), farther axes dimmed, with an N mark for the house's north. It follows every orbit; in Top it shows X right, Y up, and Z toward the viewer. Clicking Z switches to Top; clicking X or Y orbits the 3D view (switching from Top first) so that axis points at the viewer, keeping the pivot, elevation, and distance. It is a view change only (no history) and is never part of exports.

| Context | View choice | Navigation and editing |
| --- | --- | --- |
| Main active-floor overview / floor-plan layout | Top or 3D | Pan and zoom in either view; orbit/rotate in 3D. Elements can be selected/manipulated using their edges/handles in the active editing context. |
| Top view | Locked top-down | No tilt/orbit away from the plan. Orthographic projection. |
| 3D view | Rotatable open-top view | Orbit, pan, and zoom to reach visible element edges/handles; camera motion and object editing use distinct gestures. |
| Room Editor | Top or 3D | Footprints stay on the plan plane; walls and instances are edited in the same mode. Choosing a wall tool switches to 3D so vertical handles are visible. |

Camera movement changes the view, not saved geometry, north, dimensions, or object rotation. Top/3D switching must preserve the authored layout and valid selection. Define separate gestures for orbit/pan versus dragging an editable edge so one pointer operation cannot both move the camera and resize a wall. The gestures are trackpad-first (macOS):

| Action | Top view | 3D view |
| --- | --- | --- |
| Select; start/commit an operation | One-finger click | One-finger click |
| Pan | Two-finger scroll | Shift + two-finger scroll |
| Orbit | — | Two-finger scroll |
| Zoom toward pointer | Pinch | Pinch |
| Frame floor / selection | `F`; double-click empty space frames only in overview | `F`; double-click empty space frames only in overview |

**Pan and Orbit tools** (owner, Phase 5.13; SketchUp's Camera tools): the toolbox's last section has **Orbit** (O) and **Pan** (H, a hand), in the overview, the Room Editor, and the Carpet Editor; the wall face view and Feature Editor have Pan only, since orbit is off there. While one is active, a primary drag moves the camera instead of editing: Pan moves the view with the pointer (open hand, closed while dragging); Orbit turns the view about the point grabbed at the press (that point becomes the orbit pivot; empty space keeps the current pivot), with Shift panning for as long as it is held. Choosing Orbit switches to 3D; in Top, primary drags always pan. **Holding Space** gives Pan from any tool (Space + Shift orbits) and returns to the tool, with any running operation intact, on release; a quick tap of Space (under 300 ms, no camera movement) still chooses Select. Camera moves never enter history, change the selection, or commit or cancel an operation. Pinch and scroll keep working with both tools. Click–move–click works too: a click without dragging makes the camera follow the pointer until the next click, Escape, or a tool change.

Mouse fallback and the Trackpad/Mouse preference are defined in [D16](../../decisions.md#d16-interaction-defaults-and-support-limits). Touch screens are out of scope here. The Home Assistant viewer uses the same gesture map (`src/renderer/navigationInput.ts`) on its own camera, adds a touch map, and has these camera buttons without the gizmo ([viewer navigation](../../home-assistant/viewer-mvp.md#houseviewer), Phase 14.6).

A visible **Fit to screen** button (the toolbox footer's last button, above the gizmo) frames the active floor in the overview, the focused room at every level inside it, and the open face in the wall face view, resetting zoom and the orbit pivot (owner requirement, Phase 3). `F` frames the rooms that hold the selection (the open room when nothing is selected inside it), else the active floor; double-click on empty space frames only in the overview of a one-floor house and in the whole house (a floor of a multi-floor house leaves to the whole house instead). Initial framing uses the active floor's geometry bounds and a stable orbit pivot. Do not recenter during every wall/area drag and make the view jump. The frame action (`F`) restores a useful view after navigation; zoom is clamped relative to the floor bounds. Room Editor in 3D retains all three navigation actions so small edges and tall walls remain reachable.

These controls define camera behavior, separate from [D03's model-coordinate conventions](../../decisions.md#d03-coordinates-units-and-floor-local-geometry). Looking at the plan from above or orbiting it does not determine stored axes, canonical units, or an area's local-to-floor transform. Camera policy in a future Home Assistant card is separate (D15, post-MVP).

## Operation input: click, lock, type, commit

Every geometric command follows one SketchUp-like model ([D16](../../decisions.md#d16-interaction-defaults-and-support-limits)):

| Step | User action | Result |
| --- | --- | --- |
| Start | First click on a handle, edge, face, or wall end line | Operation starts and locks its direction; no button needs to be held |
| Preview | Move the pointer | Geometry previews along the locked direction; a live readout shows the distance in the project unit |
| Exact value | Type `3m`, `250`, `12ft`, or `30°` | The value box shows the input; the preview jumps to exactly that distance or angle in the locked direction |
| Commit | Enter (typed value), second click (pointer position), or release after an initial drag | One undoable command |
| Cancel | Escape | Restores the prior state; no history entry |

Locked directions by tool:

| Tool | Locked direction |
| --- | --- |
| Extrude/raise a wall | Vertical |
| Trim/extend a wall end line | Along the wall's edge, continuing past a corner onto the next edge when extending |
| Move an area or object | Normal inference/snapping; **Shift** constrains to the dominant red X or green Y axis; **Ctrl** moves freely without snapping ([D16](../../decisions.md#d16-interaction-defaults-and-support-limits)) |
| Rotate an area | Around the floor's vertical axis; typed values are degrees |
| Resize a shape | The dragged edge's normal |
| Pencil | Each segment's direction from the previous vertex; a typed value places the next vertex at that length |

The value box parses input with the same shared parser as property fields; unsuffixed values use the project unit.

**Automatic click/drag detection (owner, 2026-11-15):** plain press–release starts a click–move–click operation. Moving beyond the drag threshold while holding the initial primary press instead makes release commit at its final position. Movement after the first release only previews; it does not arm a release commit. This applies to moving rooms/shapes/instances (including lights, carpets, and wall openings), rotating, resizing handles, corner editing, push/pull, trim/extend, rectangle/circle drawing, and tape. The polygon pencil applies it per segment: dragging places the next vertex on release, while closing still needs the first vertex or Enter. Single-click actions such as Split retain their own behavior.

**Implementation convention:** one shared input adapter uses a 4 CSS pixel threshold (the moving tools use the larger [click slop](#the-click-slop), Phase 19.6), independent of zoom, model units, and Magnetic. It records maximum excursion while the primary button is held, ignores initial sub-threshold jitter, and includes the final release coordinates even if the browser coalesces pointer moves. A cancelled pointer or unexpectedly lost pointer capture drops the preview without history. Merely leaving the viewport does not cancel a locked operation. Each tool reports whether it has an unfinished operation so selection cannot drift during it.

### The click slop

Owner requirement (Phase 19.6, 2026-11-18: "a quick click never nudges"): for every tool that moves or resizes existing things (Select's handles and Move crosses, Nudge/Move in every level: rooms, shapes, objects, lights, carpets, openings, floors in the whole house, roof points and lines, canopies, roof holes and windows, wall features; the corner editor), the press that starts an operation is a **click** until the pointer has moved more than the **click slop** from where it was pressed, or the press has been held briefly and moved.

- **Values** (implementation convention, `src/renderer/pointerSlop.ts`, shared with the HA viewer's tap slop): **6 CSS px** for a mouse or pen, **12 CSS px** for touch, measured on screen (independent of zoom, units and Magnetic); a press **held 250 ms** becomes a drag once it has moved **2 px**.
- **Inside the slop nothing moves**: no pointer move reaches the operation, held or not. A release there keeps the operation locked (click–lock–type–commit is unchanged: typed values and arrow locks work at once), and a second click before the pointer has left the slop **cancels** it. A quick click, or two, therefore never changes the document and makes no undo entry.
- **Past the slop** the operation follows the pointer as it is: a whole thing moves by the pointer's offset from the press point (no jump; a wall item's Move cross is measured from the pressed point, not the cross's centre); a grabbed box point, handle or roof point attaches to the pointer (SketchUp). A release after a real drag commits, as before.
- Drawing tools (lines, shapes, tape, walls) keep the plain 4 px drag threshold below.

Camera gestures (two-finger scroll, pinch) remain available while an operation is locked and do not commit or cancel it. This follows SketchUp's [Auto Detect click style](https://help.sketchup.com/en/sketchup/drawing); applying the same convention across Homeplan's geometric tools is an owner requirement.

## Optional main-view photorealistic render (MVP Phase 2)

In the main active-floor overview, provide a header action (**Photorealistic render…** in the Export menu) to render the current Top/3D view photorealistically on the backend when configured. Freeze the current floor, full camera/framing, materials, artificial lights, and sun/environment; submit a render job and display its resulting image in the frontend. Show status/cancel/errors and a return-to-editor action. Do not expose this render action in Room Editor for MVP. See [render workflow](../../delivery/rendering-and-exports.md#main-view-photorealistic-render).

## House context hierarchy

```text
House                                      [frame: show floor] [+]
  Etage1                                   [frame: show floor] [trash] [+]
    Living Room                            [frame: fit room]   [trash] [+]
      Floor                                [+]
        Rug 1                              [trash]
      Walls (4)
        Wall (bottom)                      [trash] [+]
          Window 1                         [trash]
          Door 1                           [trash]
          Feature 1                        [trash]
        Wall (right)                       [trash] [+]
        ...
      Objects
        Dining set (5)                     [trash]
          Table / Chair 1 / ...            [trash]
        Sofa / TV / Picture                [trash]
      Lights
        Pendant Light 1                    [trash]
    second bedroom
      Floor
      Walls
    Light groups
      Evening (3)                          [trash]
    Guides
      Guide line 1                         [trash]
    Roof                                   [trash]
  Etage2
    ...
```

The `Floor` row inside an area represents that area's flooring/2D footprint. It is distinct from the building floor, such as `Etage1`. Its carpets are listed directly under it. A wall lists its doors, windows, and features (boxes and niches, [D21](../../decisions.md#d21-wall-reliefs)). The area's **Objects** row lists each [object group](../features/object-groups.md) with its members under it (a count badge after the name), then the ungrouped objects. An object lists its [ambient effects](../features/ambient-effects.md) (Swirl, Vapour) under it. Objects, Lights, Light groups, Guides, and Roof cuts rows appear only when they have children. A disabled light and a hidden guide or inactive roof cut show muted.

An area is a named entity within a floor, such as Living Room, second bedroom, Hall, or Garden. Its objects, lights, wall children, and carpets are described in [materials and objects](../features/materials-and-objects.md). Light groups are listed under the building floor in a **Light groups** row, referencing their member lights ([D08](../../decisions.md#d08-lighting-and-groups)).

A **yard** (Phase 17.2, [yards](../features/yards.md#tree-and-panel)) shows like a room with the yard icon; its walls are listed in a **Fences** row (`Fence (bottom)`…), its doors as gates, and its carpets are its pathways.

Stairs and floor openings are objects in a room (Phase 16.14): **Staircase…** and **Floor opening…** in the room's + menu open the picker of those templates and place the choice at the room's centre with its default size (a stair's rise is the gap to the next floor above); they are rows in the room's Objects folder and move and rotate like any object. The floors they reach are cut automatically; see [stairs and floor openings](../features/staircase-areas.md). Areas have no type, Opening or Staircase rows (before Phase 16.14 a staircase area replaced its Floor row with Opening and listed its Staircase).

### Adding children from the tree

Every row that can hold children has an **Add** button (`+`) alongside its other row actions. It opens a dropdown that lists only the child types that row allows ([D14](../../decisions.md#d14-project-management-and-names)). Rows that can't hold children have no Add button.

| Row | Add dropdown offers |
| --- | --- |
| House | Floor |
| Building floor, e.g. `Etage1` | Area, Yard (ground floor only, Phase 17.2), Light group, Roof (top floor only, once, Phase 19.1), Canopy (Phase 19.3) |
| Area | Object… (template picker), Staircase… (stair picker), Floor opening… (floor-opening picker), Light |
| Yard | Object…, Light |
| Area's Floor row | Carpet (`Floorable`); in a yard, Pathway (a carpet in built-in Paving) |
| Straight wall segment | Door…, Window… (`Wallable` template picker), Feature; on a yard's fence, Gate… (the gate picker) |

- **Walls** have no Add entry: they are raised from the floor shape's edges in Room Editor.
- **Curved walls** have no Add entry: doors, windows, and features on them are deferred ([D20](../../decisions.md#d20-walls-on-circles)).
- **Floor shapes** are drawn with the Room Editor's shape tools, not added from the tree.
- **New area:** named `Area N` with the next free number, placed at the center of the current view, and opened in Room Editor with the Rectangle tool active so its shape can be drawn immediately.
- **New floor:** named with the next free `EtageN` and activated.
- **New object, door, or window:** opens the template picker, then places the instance with its template's default placement.
- **New light:** starts at the room's centre, 100 mm under its highest wall (or the house default wall height), selected, and follows the pointer until a click places it; Escape leaves it at the centre ([light handles](../features/lighting.md#light-handles)).
- **New carpet:** a selected one-piece carpet on the area's floor.
- **New yard** (Phase 17.2, [yards](../features/yards.md#adding-a-yard)): `Yard N`, an 8 × 6 m Lawn rectangle against the south of the floor's areas with picket fences (none on the edge against the house), selected; the ground floor (lowest by elevation) only.
- **New pathway:** `Path N`, a selected 1200 × 4000 mm carpet in built-in Paving at the yard's centre, edited in the Carpet Editor.
- **New feature:** a flat 600 × 600 mm square on the wall's interior face, centred along the wall and 900 mm up (centred on walls under 1.5 m), with that face's material; it opens in the Feature Editor.
- **New light group:** holds the lights of that floor that were selected, and is selected.
- **New canopy** (Phase 19.3, a building floor's, room's or yard's + menu): an attached roof (it cuts nothing) over the room or yard (its bounding box up to 6 m each way, else 3000 × 2500 mm at its centre), at 2400 mm, selected in the floor view ([canopies](../features/roofs.md#attached-canopies)).
- **Roof window…** (Phase 19.3, a roof row's + menu): the roof-window picker; the choice lands on the roof's best face. A roof row lists its holes and roof windows (flagged when they no longer fit).
- **New roof** (Phase 19.1): a flat roof over the top floor's bounding box grown by 400 mm on every side, at the floor's tallest wall, selected in the whole house ([roofs](../features/roofs.md#adding-a-roof)). The roof is a row under its floor; double-click or Enter opens its editing level. In the whole house a click selects it (its outline highlights) and the properties panel shows its schema-driven properties.

Each add, including a new floor, is one undoable command. The dropdown is the design-system [`MenuButton`](../../design-system/README.md#7-initial-component-responsibilities).

### Selection, focus, and mode changes

Selection, viewport focus/isolation, and editing mode are distinct operations. A name click selects (the tree selects one row at a time); moving is the Nudge tool's job. Double-clicking a row (or Enter on it) opens the matching [editing level](#editing-levels): a room its Room Editor, a carpet its Carpet Editor, a wall its face view, a feature its Feature Editor; rooms have no pencil action (owner, 2026-11-15). A room's frame action (Fit-to-screen icon) fits the room to the screen and selects it, without isolating or toggling (owner, 2026-11-15); floor and house rows use the same frame icon to return to the overview and fit the floor (owner, 2026-11-15); Floor and Walls rows have none.

| Target | Name/item click | Row actions |
| --- | --- | --- |
| House | Select house properties; retain the active floor. Multi-floor: return to the whole house (Phase 16.4) | Frame (one floor: overview, fit the active floor; multi-floor: whole house, fit), Add floor |
| Building floor | Activate and select it (in the whole house: select it as a group); double-click or Enter opens it | Frame (open it, overview, fit), Add, Trash when another floor remains |
| Room/area | Select the whole room | Double-click or Enter to edit, frame icon to fit to screen, Add, Trash |
| Area's Floor/Opening | Select the floor surface properties | Add carpet where applicable |
| Carpet | Select the whole carpet | Double-click or Enter opens the Carpet Editor, Trash |
| Walls group | Select all walls; stay in the current mode | Expand/collapse |
| Individual wall | Select its properties | Double-click or Enter opens its face view; Add door/window/feature on straight walls, Trash |
| Door/window | Select its properties | Trash; always nested under its host wall |
| Wall feature | Select its properties (depth, material) | Double-click or Enter opens the Feature Editor, Trash |
| Objects / Lights row | Select all objects / all lights of the room | Expand/collapse |
| Object group | Select the group | Trash ungroups (never deletes the members) |
| Object, light | Select it (a grouped member alone) | Trash |

Every deletable model row has a labelled trash-can action: building floors when more than one remains, areas, walls, doors/windows, objects, carpets, lights, light groups, guides, and roofs (stairs and floor openings are objects). It invokes the existing undoable delete command. Required floor surfaces and synthetic grouping rows cannot be deleted independently. House deletion remains on the Houses screen.

Row order (owner clarifications, 2026-11-15): expand/collapse triangle, the row's **type icon** (always visible; it describes the row and is not an action), the name immediately followed by its count badge (`Walls (4)`), the warning marker, then the action icons on the right. The triangle, type icon, and warning stay visible; the action icons appear on hover, selection, or keyboard focus. Disclosure triangles keep a fixed width even when a row has Delete, frame/magnifier, and Add actions; leaf rows reserve the same disclosure slot to align names.

Inside a floor, only the active floor contributes visible geometry, emitters, shadows, and picking; other saved floors remain in the tree. In the whole-house overview, selecting a row inside a floor (a room, a wall, ...) opens that floor first (SketchUp's outliner opens the context that holds it). During Room Editor (and every level inside it), tree rows outside the focused area's subtree are disabled, including their row actions. Tree rows indent 0.75rem per level (owner, 2026-11-16). **Tree reveal** (Phase 7.4, owner 2026-11-16): a new selection made anywhere (the view, a key, an agent) opens every row above it (floor, room, Objects, group, wall) and scrolls the first selected row into view; the selected row is highlighted across its full width, and the rows above it show a strong label and an accent icon. Rows the user collapsed stay collapsed until the selection changes again. A splitter between the tree and the properties panel can be dragged (or moved with the arrow keys when focused) to give either more room; its position is kept in the editor preferences.

### Auto-select

Owner clarification (2026-11-15): the toggle beside Magnetic has exactly two click behaviors. It is session-local, shared across modes, and off by default.

| Mode | First click/drag on a target | Hover |
| --- | --- | --- |
| **Auto-select off** | Start the active tool on the **existing selection**; ignore which object is under the cursor and preserve selected IDs | Never changes selection |
| **Auto-select on**, clicked target differs from selected targets | Select that target only; consume the full press/drag/release without starting an operation | Never changes selection |
| **Auto-select on**, clicked target is already selected | Start the operation on that existing selection, exactly as with Auto-select off | Never changes selection |

- This applies to Move/Nudge and Rotate. **With A selected and the cursor over B: Off starts the operation on A and leaves A selected; On selects B and returns without starting any operation, then a following click on B starts the operation on B.** Off also accepts an empty-space reference point. With no eligible selection, Off does nothing; On may select a clicked eligible target but must return without starting the action.
- Hover may highlight a handle and show its action, but never changes the selected IDs or properties panel, with either toggle state.
- With Auto-select on, compare the clicked target before starting an editing tool. A different-target gesture only selects; a following click/drag on that same target acts. Ctrl does not bypass this guard. Select's Shift-click retains its additive/toggle meaning.
- **Shift flips Auto-select for one press in Nudge and Rotate** (owner, Phase 4 follow-up; supersedes "Shift does not bypass"): with Auto-select off, a Shift-press on a different target selects it and returns; with Auto-select on, a Shift-press acts on the existing selection. Pressing or releasing Shift while hovering refreshes the hover at once (Rotate shows the hovered room's grips while it would select). Once an operation runs, Shift keeps its operation meaning (Nudge: red/green axis; Rotate: quarter turns). **Cue (Phase 5.3):** while Shift is held in Nudge or Rotate with no operation running, the Auto-select button shows the state the next press will use (lit when Shift turns it on, dark when it turns it off) with a dashed ring and a ⇧ badge, and its name reads "Auto-select: on while Shift is held"; when the next press will select, the cursor is an arrow with a dashed selection box (when it will act, the tool's cursor stays); releasing Shift, starting an operation, or the window losing focus restores the normal look. Other tools show no cue.
- During an unfinished operation, the next click commits that operation even over another object; it never retargets it. Both click–move–click and press–drag–release remain supported.
- Resolve the clicked target through the active tool's hit test: room handles identify rooms in overview; shape/corner handles identify shapes, wall handles identify walls, and instances identify themselves. Other rooms remain unpickable in Room Editor.
- Creation tools retain their normal start-point workflow, including empty-space starts. Auto-select does not create anything or alter snapping; orphan reassignment retains its explicit repair target.

## Editing focus in Room Editor

Owner requirement (2026-11-15, superseding separate floor/wall modes): one room-editing context exposes both toolsets together.

- Other rooms and their content render at 10 % opacity and cannot be selected; they remain inference references.
- Shape drawing and Corner edit, and the whole Carpet Editor, fade the room's own walls and objects to 25 %. Select, Nudge, and wall tools keep them clear so they can be picked and edited.
- **Show others**, in the header at every level inside a room, toggles other rooms between faded and hidden (session-local; default faded).
- **Doors and windows in a shared wall** (Phase 15.7): a neighbour's door or window stored on a wall that runs along the edited room's boundary draws like the room's own (clear, and drawn with others hidden too), and the room's walls keep its doorway open. It stays locked like the rest of the neighbour (edit it from its own room). Rule: the opening's cut footprint (its wall's span across the merged wall thickness + the 0.5 mm contact tolerance) holds a parallel edge of the room's floor outline, within 1 mm more (`shared/geometry/sharedOpenings.ts`, `openingsInAreaBoundary`; implementation convention).
- Select chooses floor shapes, walls, and instances in the same mode. Existing selected shape handles resize shapes; a selected room shows its [box handles](#shape-groups), which resize its whole floor; wall faces select walls. Nudge moves shapes, carpets, objects, lights, and wall openings with their existing constraints.

## Editor sessions: keep edits on exit

Owner requirement (2026-11-15): double-click outside the edited room or press **Done** to return to the overview; the nested levels leave the same way, one level at a time ([editing levels](#editing-levels)). Double-click inside stays in the editor. Leaving a level cancels any unfinished tool preview; committed edits remain individual Undo steps. There is no session-wide Cancel or Discard changes, and no entry snapshot.

**Escape**, when nothing else is running, steps out: it first cancels the running operation, then returns to Select, then clears the selection, and only then leaves one level (Phase 7.1, owner 2026-11-16, SketchUp-like; it replaces the Phase 3 rule that Escape never leaves a level). Leaving the house retains committed edits and flushes the working write; a failed write still warns before work can be lost. Floor switching remains disabled in the tree until leaving Room Editor.

## Tool lifecycle

- Drawing tools (rectangle, circle, polygon pencil) return to Select after each commit, with the new shape selected (owner requirement, Phase 3). Escape returns to Select.
- Push/pull, tape, and similar repeat tools stay active until Escape or another tool is chosen.
- Choosing another tool (toolbox or shortcut) cancels the active operation with no history entry and clears its preview and readout.
- Tool shortcuts follow SketchUp where it has an equivalent: **Space** Select and **M** Nudge everywhere; Room Editor **V** corner edit, **R** rectangle, **C** circle, **P** polygon pencil, **U** push/pull (raise), **E** trim/extend, **S** split, **W** fill walls, **T** tape; **Q** rotate (Room Editor: shapes, carpets, objects, lights; overview: rooms, carpets, objects, lights); overview **T** tape; **O** orbit and **H** pan. A key selects only a tool shown at the current level (the Carpet Editor has no wall keys; the face view has R, C, P, U for feature depth, and H; the Feature Editor adds V and has no U). A letter goes to the typed-value box only while a number is already being typed there (so `2.5m` still works); otherwise it selects the tool. Shortcuts apply while the keyboard is on the canvas, toolbox, header, or tree (letters only there; Space selects a tree row), not in fields, menus, or popups.
- Holding **Space** pans from any tool ([Pan and Orbit](#camera-controls-and-view-choices)); a tap still chooses Select.
- Editor keys outside fields: **⌘Z** / **⇧⌘Z** undo/redo (a focused field without a draft lets them through), **⌘S** Save (a focused field commits first), **F** frame, **Delete**/Backspace delete the selection (not the house, a floor, or a floor surface), **⌘A** all walls of the edited room, **Escape** cancel, back to Select, clear the selection, then leave one level.

## Inference and snapping

Owner requirement (Phase 3 feedback): snapping behaves like SketchUp's inference engine and works in every tool, including the Room Editor. One shared engine serves all geometric tools; Magnetic turns it on and off.

- **Targets:** endpoints and vertices, midpoints, shape **centres** (rectangles, circles) and circle **quadrant points** (on the floor's red/green axes), points on edges, intersections, guides, and **projected inference lines**: the extensions of every edge and wall face and the plan axes through every vertex, centre, and quadrant, so a point can align with geometry it does not touch. Carpet shapes are sources like floor shapes (Phase 4.2).
- **Heights:** every distinct wall height and wall-top line on the active floor projects a horizontal inference line. Raising or pulling a wall snaps to these heights; for example, a second wall snaps to 2.50 m when another wall is 2.50 m tall.
- **Scope:** inference uses the whole active floor, including faded or hidden areas.
- **Cues:** a dotted inference line from the source to the pointer, colored by kind (plan x red, plan y green, vertical or height blue, parallel or perpendicular to an edge magenta), a marker at the snapped point, and a short label such as "Endpoint" or "Height 2.50 m".
- Capture is screen-space ([D05](../../decisions.md#d05-walls-between-adjacent-areas) convention); typed values are never snapped.

## Wall handles and hover

- Handles are hit-tested on screen against their 3D geometry (top edges, vertical end lines, faces, bare floor-shape edges), not through the floor plane, so they work in Top and 3D.
- The handle under the pointer highlights and the cursor shows its action, so every draggable part is discoverable. A hovered point handle (resize dot, corner, edge midpoint, quadrant, rotate grip, centre cross) keeps its size and shape and turns **darker and bolder** (owner, Phase 4 follow-up), with a short label of what it does (for example "Resize: radius (Option: diameter)", "Centre: move it with Nudge (M)").
- Each handle belongs to one tool (owner, Phase 3): **Push/pull** (U) drags a wall's top edge to change its height (Shift: all selected walls) or a bare floor edge to raise a new wall from 0; **Trim** (E) drags a vertical end line to trim or extend; **Split** (S) cuts where you point. **Select** only selects walls (Shift adds).
- After a split, a visible seam marks the boundary between the two walls even when they are collinear with equal settings.

## Mode 1: active-floor overview

Show the active floor with a Top/3D view choice; the builder opens in 3D (owner, 2026-11-15). The 3D view is open-top and supports orbit, pan, and zoom; Top stays top-down with pan and zoom. A floor's overview shows that floor alone in its own local frame (its placement is not applied); floors are stacked only in the [whole-house overview](#whole-house-overview). There is no stored floor-to-floor height: floors carry placements ([model](../model.md#floor-placement-and-slab)).

## Whole-house overview

Phase 16.4 (owner decisions 5 and 6, 2026-11-18). A house with more than one floor opens on the whole house: every floor drawn at its placement (each floor's root at `floorToHouseOffset(floor)`), open-top, and **complete** (Phase 18.1, owner 2026-11-18, replacing the 16.4 cost choice): its walls, room floors, carpets, textures and slab, and all of its content: furniture, stairs and floor openings, doors and windows, wall-mounted items, trees, yard fences and gates, and its light fixtures, with every floor's lamps lit (one light topology for the house, the four brightest lamps that are on casting shadows; light pins are not shown or picked there). Ambient effects are not drawn there. Moving a floor moves its contents and lamps with it (the preview moves only the floors' roots), and each settled floor is merged for drawing ([renderer](../../architecture/renderer.md#builder-house-overview) for the measured policy). A one-floor house opens on its floor as before and has no whole-house level.

- **Floors are groups** (SketchUp): a click selects a whole floor (Shift adds or removes one, empty space clears); its children cannot be picked here. Hover shows the floor under the pointer as its **bounding box** (SketchUp's group box; owner feedback 16.13): thin accent lines along the twelve edges of an axis-aligned box around the floor's slab outline, from the slab underside to its tallest authored wall top (walls risen to a roof ignored). Selected floors show the same box (SketchUp shows a selected group's box), so a hovered floor that is already selected adds nothing. A running Move draws the moving floors' slab outlines instead (at the finished floor and, dashed, at the slab underside), because the move snaps those outlines' corners and edges. The properties panel shows the floor's Name, Placement (Position, Elevation) and Slab (Slab thickness, Slab material).
- **Enter and leave:** a double-click on a floor (or Enter / double-click on its tree row, or its row's frame action) opens it in its local frame and the other floors leave the live scene; a double-click on empty space fits the whole house. Inside the floor, the header shows "Editing House › Ground" with **Done**; Done, Escape (after cancelling a running operation, Select, and clearing the selection), the House link, a double-click on empty space in the floor's overview (the background or the ground; a measurement guide under the pointer counts as empty space, since guides are drawn across the whole view), or selecting House in the tree return to the whole house with that floor selected. A double-click on a room, wall, carpet, light or object of the floor still opens it. Deeper levels leave one level at a time as before: a double-click on empty space in the Room Editor returns to the floor, a second one to the whole house (SketchUp: a double-click outside the open group closes it). A one-floor house has no whole-house level; there a double-click on empty space fits the floor. Entering frames the floor; returning frames the house.
- **Move (Nudge, M)** moves the selected floors only; floors above do not follow, and several selected floors move together (owner decision 6). Click–lock–type–commit (D16): the first click (on a selected floor or, with Auto-select off, anywhere) grabs; the floors preview live; a second click, Enter after a typed distance, or the release of an initial drag commits one `Move floor …` / `Move n floors` step; Escape cancels with no history. The move runs on the horizontal plane through the grabbed point; SketchUp's arrow-key locks: **↑** locks blue (vertical, read from the pointer on the vertical through the grab point; a typed value goes up, or down when the pointer is below), **→** red, **←** green; the same key again or **↓** frees it. **Shift** locks the dominant red/green axis, **Ctrl** moves without snapping; Auto-select and its Shift flip work as for rooms.
- **Snapping** (Magnetic, 10 px capture; `shared/geometry/floorMove.ts`): horizontally, a moving floor's slab-outline corner snaps onto another floor's slab corner ("Corner of Ground"), else onto an edge, then slides along that edge onto a second, non-parallel edge ("Edges of Ground"); with a red/green lock a corner aligns with another floor's corner along the axis. Vertically (blue lock), the slab underside rests on another floor's wall tops ("Slab on the walls of First"), the wall tops meet another floor's slab underside ("Walls under the slab of First"), or the finished floors are level ("Level with Ground"). Typed values are never snapped.
- **Toolbox:** Select, Nudge, Orbit, Pan, Magnetic, Auto-select, and the camera buttons; other tool keys say they are not available in the whole-house overview.

Selecting an area selects the area as a whole. It can be moved horizontally in the floor layout to align it with another area. Its footprint, walls, and attached renderables must move together rather than leaving parts behind.

**Required interaction:** dragging an area using its wall-line handle first snaps to **Touching**, then a further push snaps to **Full clash**. For `20 + 20 cm` walls, these produce `40 cm` and one shared `20 cm` wall respectively. For `20 + 40 cm`, they produce `60 cm` and `40 cm`, and any position in between gives `40`–`60 cm`. Pushing past Full clash is flagged. Preview the resolved wall geometry and each room's interior material on its exposed side. Magnetic governs proximity snapping; actual touching/overlapping geometry is prepared consistently even when Magnetic is off. See [area detents](../features/shared-walls.md#arranging-areas).

Shared geometry does not combine the area's editable footprint or identity with its neighbor. The source walls are preserved and the shared physical result is derived; moving the area away restores its separate wall surfaces/materials.

RealFloor extends beneath outward wall thickness while retaining the area's measured footprint. Areas are created from the tree's [Add menus](#adding-children-from-the-tree). The camera/view behavior is defined above; absolute building-floor elevations are outside the MVP.

### Moving rooms

Owner requirement (Phase 3 feedback):

- Moving happens only with the **Nudge** tool (rooms, objects, lights, carpets in the overview; shapes and carpets in Room Editor; openings along their wall in Room Editor). The **Select** tool only selects (click, Shift-click to add); dragging with Select moves nothing.

- **Normal:** preserve automatic inference, edge/corner snaps, Touching/Full clash detents, and alignment rotation governed by Magnetic.
- **Shift held:** constrain translation to **red (floor X) or green (floor Y) only**, using the larger absolute component of the start-to-pointer plan displacement. Re-evaluate while the pointer moves, so the axis can switch. A 45° tie chooses red (implementation convention). Never choose a diagonal room/neighbor/guide direction, including in rotated rooms. Along-axis proximity snaps may refine the distance while keeping the perpendicular component exactly zero; no alignment rotation.
- **Ctrl held:** move freely in both plan axes, bypassing all proximity snaps, axis inference, detents, and alignment rotation without changing Magnetic's saved session state. Ctrl wins over Shift. Host constraints (openings/wall objects stay on their wall) remain valid.
- Modifier press/release refreshes an unfinished move immediately at the existing pointer position, including click–move–click. Releasing returns to the remaining mode. Typed lengths remain exact in the current direction, and committing either gesture produces one Undo step.
- Hovering a room highlights what you would grab: a wall's **inner or outer top edge**, a **top corner**, or the floor (whole room). The highlight shows which face or corner it is. A corner wins over the edges meeting there anywhere within 12 px of it; edges capture within 8 px (implementation conventions, owner 2026-11-15: corners must not need pixel-exact aim).
- A grabbed edge snaps flush and parallel to other rooms' inner and outer edges and their extensions; a grabbed corner snaps to other rooms' corners, then edges and inference lines ([inference and snapping](#inference-and-snapping)).
- Drag and drop is the way to align rooms: when a grabbed edge nears another room's edge at a small angle, the room rotates about the grab point to make them parallel and snaps flush in the same drag (Alt suppresses the rotation).
- Touching and Full clash remain named snap results when an outer edge meets a parallel neighbour ([shared walls](../features/shared-walls.md#arranging-areas)).

### Rotating rooms

Owner requirement (Phase 4), following SketchUp's rotation grips:

- With **Rotate** (Q), each selected room shows four **grips** at the side midpoints of its bounding box (footprint and walls, in the room's own axes), drawn at the height of its tallest wall; with [Auto-select](#auto-select) on, the room under the pointer shows them too. The grip under the pointer highlights. Rotation starts only from a grip of a selected room. Hover never selects, and the tool never changes the selection itself: with Auto-select off a press elsewhere does nothing; with it on, the first press on a different room (body or grip) selects it and returns, and the next press on its grip rotates it.
- The room turns about the **bounding-box centre** (marked with a cross). A dashed line runs from the centre to the dragged grip, and faint marks show the grip's quarter-turn positions.
- **Normal:** the rotation follows the pointer freely. While the dragged grip is within 16 px of a quarter-turn mark (0/90/180/270°), it locks there and the cue reads "Quarter turn"; moving on unlocks it. There are no other angle snaps (no 15° steps, no neighbour wall angles; aligning to a rotated neighbour is Nudge's drag-to-align).
- **Shift held:** quarter turns only. **Ctrl held** (or Magnetic off): no snapping. Ctrl wins over Shift; both refresh at once when pressed or released. Ctrl is read during the move, not at the press (Ctrl-press on a macOS trackpad is a secondary click).
- Typed degrees are exact. Click–move–click and drag–release both work; Escape cancels; one rotation is one undo step. Grip capture is 12 px (implementation conventions).

### Moving and turning placed things

Owner requirement (Phase 5 follow-up): carpets, floor and overhead objects, and lights move and turn like rooms, with one handle language and no tool-specific grips in Select.

- **Live:** every move, turn, and resize draws the thing itself at its new place while the operation runs (not only an outline); the document changes only on commit, as one undo step, and Escape restores it.
- **Nudge (M)** shows the selected thing's **box** in its own axes with its four corners, four edge midpoints, and centre. The point under the pointer lights up (darker and bolder) and is named ("Corner", "Edge midpoint", "Centre"); pressing it grabs that point, which then follows the pointer's inference (endpoints, edges, axes) the way a room corner does; Shift locks an axis, Ctrl moves freely. A press elsewhere on the thing moves it by the pointer's offset. Wall-hosted objects and openings still slide along their wall.
- **Rotate (Q)** shows the same box with its pivot (a cross) and grips at the four side midpoints, like rooms.
- Select keeps only Move and resize handles (and a light's Raise, Stretch, and Aim); there are no turn grips in Select.

### Rotating placed things and shapes

Owner requirement (Phase 5 follow-up): **Rotate** (Q) turns the single selected floor shape (rectangle or polygon), carpet piece, carpet, floor or overhead object, or light; in the overview it does the same for a selected carpet, object, or light and otherwise rotates rooms. It works like [rotating rooms](#rotating-rooms): four grips on the thing's box in its own axes (pushed out to at least 28 px from the pivot so small things stay turnable), the same quarter-turn lock, Shift quarter turns, Ctrl free, typed degrees, one undo step, and the same Auto-select behaviour. Shapes and carpets turn about their box centre; objects and lights about their own position. Circles and wall-hosted objects have nothing to turn. In the overview, Rotate turns the selected carpet, object, or light, and otherwise the selected rooms.

### Hide and Hidden

Phase 7.5 (owner J12; decisions P4, P5). Rooms (areas), walls, wall features, objects, object groups, carpets, and lights can be hidden two ways:

- **Hide** (session-only, like SketchUp's temporary hide): the **eye** on the item's tree row (shown on hover; a hidden row keeps an eye-off that shows it again), **⇧H** on the selection (hides it; when all of it is already hidden, shows it again; **H** stays Pan, as in SketchUp), or **Hide for this session** in the selection's ⋯ menu. The header's **Unhide all** shows everything again. Never saved, forgotten on reload.
- **Hidden** (saved): the Yes/No **Hidden** property in the General group. With **Show hidden** off (the default) the item is not drawn; with it on, it is drawn faded and can be picked and edited. The HA viewer and PNG/render exports never draw it.

Hidden things are not drawn, not picked, and not snapped to; hiding something deselects it. A hidden room takes its floor, carpets, walls, objects, and lights with it, and the shared walls are derived as if the room were not there (its neighbours' walls close up). A hidden wall takes its doors, windows, features, and the objects mounted on it; the neighbouring walls are derived without it. A hidden object group hides its members. A **hidden light keeps shining** (unless the Lights toggle is off): only its fixture and pin go, because hiding is about seeing elements; switching off is the Lights toggle or the light's Enabled. The HA viewer is stricter: there a hidden light is left out entirely, light included ([HA viewer](../../home-assistant/viewer-mvp.md)). The room being edited cannot be hidden. In the tree, rows of things that are not drawn are faded and saved-Hidden ones are greyed in italics. Doors and windows and guides are not hideable (not in P5). A hidden stair or floor opening cuts no hole in the floor shown (it is derived as if absent). The shared rule lives in `shared/domain/house/visibility.ts` ([model](../model.md#hide-and-hidden)).

### Walls off

Owner requirement (Phase 4.5): a **Walls** toggle in the header (overview and Room Editor) temporarily hides all walls and traces them on the floor, so rooms are easier to align.

- With walls off, every wall is drawn as its footprint at floor level (RealAllWalls, so Touching / Full clash show as they will merge): a filled band with its inner and outer face lines, door gaps cut. No vertical wall geometry and no wall openings (Wallable doors and windows, which cut the wall) are drawn. Wall-attached Areable objects (cabinets, radiators, TVs, frames, and the like) stay drawn in place, floating where the wall face was, and can still be picked, selected, and edited (owner, 2026-11-17). Works in Top and 3D. A selected wall highlights as its trace.
- Moving rooms with Nudge grabs and snaps at floor level: the traced inner and outer face lines and band corners are the handles and snap targets ("Outer wall edge", "Corner"); Touching / Full clash, Shift/Ctrl, and drag-to-align work as with walls on.
- Choosing a wall tool (Push/pull, Trim, Split, Fill, reassign) turns walls back on. The toggle is session-only: not saved in `house.json`, not a preference, no history entry; the builder opens with walls on. PNG export and the photorealistic render always include the walls.

## Measuring tape

The [measuring tape](../features/measurement-guides.md) creates dashed ruler/construction lines or X endpoint markers, with live typed distances such as `1.5m` converted to project units. An explicit Guide line / Guide point choice is available; guides persist per floor ([D16](../../decisions.md#d16-interaction-defaults-and-support-limits)).

The Phase 2 roof-profile tool ([roof cutouts](../features/roof-cutouts.md)) was removed in Phase 19.2: a roof in Cuts walls mode clips the floor's walls by its underside (each planar piece over its own region) and its walls rise to it; existing roof cuts were converted into roofs ([roofs](../features/roofs.md#the-roof-cuts-walls)).

## Mode 2: Room Editor

Edit the room's footprint, walls, and child instances in one mode, with both toolsets always available. Footprint editing uses the room's plan plane in Top or 3D.

The floor shape is a group with parent-relative placement and editable local shapes; it is a guide. RealFloor is derived from it and from the walls; see [geometry groups](../features/geometry-groups.md#authored-guides-and-derived-geometry).

Holes in a floor come from stairs and floor openings, not from drawn footprints ([stairs and floor openings](../features/staircase-areas.md)).

### Shape tools and properties

- Toolbox actions: add a **rectangle** (Shift for a square) or **circle**, or draw a polygon with the **pencil**.
- Support rectangular dimensions: a selected shape can be sized numerically, for example `4525 mm × 1428 mm`, as well as positioned and rotated in the group's editing plane. Use the selected display/input unit, with conversion to canonical millimeter values.
- Circles expose their radius and position.
- Select a shape to display its applicable dimensions and position in the lower right properties panel.
- Drag shape edges/handles to resize shapes, and move shapes within the editing plane.
- **Resize handles (Select, selected shape only; Phase 4.2):** rectangles have corner handles (two sides at once) and side handles; circles have four quadrant handles on the floor's red/green axes (they replace dragging anywhere on the rim). A circle resizes **about its centre** by default (radius) and, with **Option**, keeps the opposite quadrant fixed (diameter); a rectangle keeps the opposite side or corner fixed by default and resizes about its centre with Option (SketchUp's Scale convention). Option switches live; Ctrl resizes without snapping. Hovering or dragging a side, corner, or quadrant handle shows the resize cursor (↔, ↕, or a diagonal) nearest to that handle's drag direction **on screen**, so it stays right on rotated shapes and in 3D; polygon vertices show the move cursor, and Rotate grips a rotate cursor (Phase 5.15). A circle takes a typed radius (diameter with Option); the readout shows both radius and diameter. One resize is one undo step.
- Expose each shape's applicable dimensions, local position, and in-plane rotation. Derived group bounds do not replace the source shape with a rectangle.

Toolbox shapes are **Rectangle** (hold Shift to constrain to a square), **Circle**, and the **Polygon pencil**; triangles and irregular rooms use the pencil ([D16](../../decisions.md#d16-interaction-defaults-and-support-limits)). Walls are raised from straight edges and from circle arcs ([D20](../../decisions.md#d20-walls-on-circles)); doors and windows on curved walls are deferred.

### Nudge and Corner edit tools

Owner requirement (Phase 3 feedback, 2026-11-14):

- **Nudge** moves a whole shape (or carpet) without resizing it. The same [normal / Shift / Ctrl modes](#moving-rooms) apply to shapes, carpets, objects, and lights in Room Editor. Where you grab it decides the snap: grab near an **edge** and that edge snaps onto another edge's line, including other rooms' edges and their extensions, then slides along it; grab near a **corner** and that corner snaps to another corner first, then to edges and inference lines.
- **Select** keeps the shape handles that change size (rectangle edges, circle radius, polygon vertices; Alt-click inserts or deletes a polygon vertex) but never moves a whole shape.
- **Corner edit** moves a single corner, so a room can become an irregular polygon. The same corner, edge, and inference snapping applies. Self-intersections are rejected and the last valid shape is kept.
- Corner edit on a **rectangle** converts it to an equivalent polygon in the same undoable edit. The new polygon keeps the rectangle's shape ID and gets stable vertex IDs; walls anchored to the rectangle's named edges (`bottom`, `right`, `top`, `left`) are re-anchored to the matching vertex-pair edges in the same command, so no wall becomes orphaned. This is an explicit conversion of identical edges, not a silent remap ([D04](../../decisions.md#d04-footprints-walls-and-stable-boundaries)). Circles have no corners.
- Grabbing a rectangle's or circle's **centre**, or a circle's **quadrant point**, anchors the Nudge at that point, so it snaps centre to centre, quadrant to edge, and so on (Phase 4.2). Corners keep priority.
- **Selected shapes** (floor shapes and carpets) draw with a strong tint and outline in the darker accent tone (`accentStrong`, 30 % fill), so they stand apart from neighbouring shapes and from hover and drawing previews, which use the lighter accent at 12–20 % (owner, Phase 5).
- Selected rectangles and circles show a **centre handle** (a cross). Before a press, Nudge highlights what it would grab on the selected shape and names it: a corner or the centre/quadrant (enlarged dot, "Corner", "Centre", "Quadrant"), an edge (the edge and its end dots, "Edge"), or the whole shape (light fill, "Shape") (owner, Phase 4.2 follow-up).

### Polygon pencil and measuring

The polygon pencil (MVP Phase 1) draws a closed polygon: click vertices, close it on the start vertex or with Enter, cancel with Escape. Self-intersections are rejected, and vertices remain editable. See [geometry groups](../features/geometry-groups.md#polygon-pencil).

The measuring tape and guides are available while you lay out shapes and pencil vertices. Typed distances use the shared unit parser, and Magnetic snaps to guides. Committed geometry stores real coordinates and does not depend on a guide.

### Magnetic behavior

With **Magnetic checked**, shapes that nearly touch snap together to make it easier to join the area footprint. With it unchecked, movement is freeform and this proximity snapping is disabled.

Magnetic is on by default and shared across modes. Snap targets are shape edges, vertices, and guides; the capture distance is a screen-space convention. Typed numeric values are never altered by snapping. Snapping aligns shapes, and the union step below produces the floor shape.

### Leaving the editor

Committed footprint edits union the source shapes into the floor shape and regenerate RealFloor and the walls anchored to its edges. Overlapping coverage is resolved geometrically, not by drawing several floor meshes over one another.

Source shapes, vertices, and transforms are retained so users can return and adjust them. Compilation is non-destructive.

Compound results keep their components and holes, with no invented bridges or bounding-box fill. An empty or degenerate result keeps the last valid floor shape and shows feedback. Walls whose source edge left the boundary are flagged for repair ([D04](../../decisions.md#d04-footprints-walls-and-stable-boundaries)).

### Wall face view

Owner requirement (Phase 5.1, [D21](../../decisions.md#d21-wall-reliefs); wall relief groups, 2026-11-16): **double-click one of the room's straight walls** in the Room Editor (or double-click/Enter its tree row) to see the face you clicked straight on, to work on its features (groups of 2D shapes with one depth and one material). The camera looks horizontally at the face, framed (Fit to screen re-frames it); orbit is off, scroll and Pan pan, pinch zooms. Geometry more than the deepest box plus 200 mm in front of the face is clipped. Under a roof (Phase 19.5) the face is framed on its risen or clipped shape (a gable end up to the ridge), which is also the outline the face tools snap to ([roofs](../features/roofs.md#the-roof-cuts-walls)). The header reads "Editing Living room › Wall (bottom) (interior)" with **Show exterior / Show interior** and **Done**; the room name, Done, or a double-click off the wall returns to the Room Editor (Escape too, once nothing is running or selected). Curved walls do not open. With no feature open the toolbox has Select (pick a feature; its [box handles](#shape-groups) resize the whole feature; double-click opens it), Nudge (moves a whole feature; Shift one axis), Push/pull (depth: up is out, down is in, typed depths, snaps to 0, other features' depths, and the deepest niche the wall allows), Rectangle, Circle, Polygon (drawing a shape here starts a new feature), and Pan. **Double-clicking a feature (or Add → Feature on the wall row) opens it**, one level deeper like a carpet: Select, Nudge, Corner edit, Rectangle, Circle, Polygon and Pan are the same shape tools as in the Room Editor and Carpet Editor, working in face coordinates (x along the wall, y up) with the same snapping, typed sizes, and handles; the feature's outline is dashed, and Done or a double-click off it returns to the face view with the feature selected. Snap targets are the wall's ends, floor, top, and centre lines, openings' edges, and the edges and centres of other features. See [the 2D shape editor](../features/wall-relief-groups.md#the-2d-shape-editor). Each change is one undo step. The face view's camera is a perspective camera aimed straight at the face, not an orthographic one (implementation convention, Phase 5.1). Push/pull here sets feature depth only; wall height stays a Room Editor Push/pull. *Proposed, not built:* Push/pull on a feature from the ordinary 3D Room Editor.

### Shape groups

Owner requirement (Phase 7.2, J3/J4): a room's floor, a carpet, and a wall feature are each a **shape group**, a list of 2D [shapes](../object-models.md) in the group's own axes (the room's, the carpet's, or the wall face's: x along the wall, y up), edited with the same tools. Geometry and command: [shapeGroup.ts](../../../shared/geometry/shapeGroup.ts), `replaceShapeGroupGeometryCommand` in [shapeCommands.ts](../../../shared/domain/commands/shapeCommands.ts).

- **Box handles** (Select): exactly one selected room (overview or Room Editor), carpet (overview or Room Editor), or wall feature (wall face view, no feature open) shows its box in its own axes, a centre cross, and four corner and four side handles. Hovering a handle highlights it, names it ("Resize room: corner"), and shows the resize cursor for its on-screen direction. Dragging (or click–move–click) scales **every shape of the group together** about the opposite side or corner, or about the centre with **Option**; **Ctrl** resizes without snapping; typing `W x D` (a side takes one value) sets the box size exactly. The result previews live with a `W × D` readout; a click or Enter commits **one undo step**, Escape cancels. A group containing a circle scales uniformly; no side goes below 50 mm. A selected floor shape's own handle wins over a carpet's handle under it.
- **What scaling keeps** (D04): rectangles on the group's axes stay rectangles with their edge names, polygons keep their vertex IDs, so a room's walls follow their anchored edges. A rectangle turned off the group's axes and scaled on one axis becomes the equivalent polygon, and the room's walls on it are re-anchored to the identical edges in the same step (as Corner edit does). A room's objects, lights, and carpets keep their place; wall openings keep their distance along their wall.
- **Move and turn** stay where they were: a room moves with Nudge (Move room) and turns with Rotate area; a carpet moves with Nudge and turns with Rotate (Q) about its box centre; a feature moves with the face view's Nudge and has no turn (the face plane fixes its axes).
- **Editing the shapes** of a group is its editing level: the Room Editor (floor shapes), the Carpet Editor, and the Feature Editor share the shape tools and handles.

### Carpets and the Carpet Editor

Owner requirement (Phase 5.14 and follow-ups); carpet contracts are in [materials and objects](../features/materials-and-objects.md#6-carpets).

- **One object:** a click on a carpet selects the **carpet**, not one of its pieces, in the overview and the Room Editor, with the normal Auto-select rules. In the Room Editor a carpet wins over the floor under it; walls and objects standing on it win over the carpet. Hovering outlines it and names it.
- **Selected:** its whole outline (the union of its pieces, clipped to the room's RealFloor) shades in the selection look (`accentStrong`, 30 %), with a dashed box in the carpet's own axes, a centre cross, and corner and side handles.
- **Resize** (Select): the [shape group](#shape-groups) box handles: corner and side handles scale the whole carpet about the opposite side or corner, or about its centre with Option; Ctrl resizes without snapping; typed `W x D`. A multi-piece carpet scales all pieces' sizes and offsets together (owner, 2026-11-15). **Move** is Nudge and **turn** is Rotate (Q), as for every [placed thing](#moving-and-turning-placed-things). Several selected carpets shade and Nudge together; resize and Rotate apply to one carpet.
- **Carpet Editor** ([editing levels](#editing-levels)): the carpet's pieces show their outlines and handles; the room's floor, walls, and objects fade to 25 % and are not pickable but stay snap targets. Rectangle, Circle, and Polygon **add a piece** to the carpet; Corner edit turns a rectangle piece into a polygon; Select resizes a piece; Nudge moves one piece; Delete removes a piece but never the last one (delete the carpet from the tree instead). With nothing selected the properties panel shows the carpet; with a piece selected, the piece. Moving or turning the whole carpet stays a Room Editor / overview action.

### Open object groups

Owner requirement (2026-11-16): an [object group](../features/object-groups.md) is two or more floor objects of one area that select, Nudge, and Rotate as one. A click on any member selects the group (every member shows its box). In the Room Editor, a double-click on a member **opens the group**: that member is selected alone, and clicks on its siblings select them one by one; a double-click away from the group closes it and selects the group. In the overview the same double-click opens the room first. The open group is session state and is not shown in the header today. **Group N objects** and **Ungroup** are [selection actions](#selection-panel-and-actions).

## Wall tools in Room Editor

Wall tools share the Room Editor toolbox with shape tools. Choosing Push/pull, Trim/extend, Split, or wall reassignment switches to rotatable 3D, with pan and zoom enabled (implementation convention). Keep camera gestures separate from geometry edits.

### Create and raise walls

- Each straight piece of the floor-shape boundary is a potential wall. A wall is anchored to its source shape edge ([D04](../../decisions.md#d04-footprints-walls-and-stable-boundaries)).
- Walls are guides; their rendered geometry is RealWall, and they enlarge RealFloor where their thickness lies outside the floor shape.
- Push/pull a straight boundary line upward to create a wall: the wall grows from height 0 while the pointer moves, snaps to existing wall heights and inference lines, and commits on the second click or a typed height and Enter (owner feedback, Phase 3). There is no default jump to a fixed height.
- Hold **Shift** when starting the extrusion to raise all bare edges of the current area together.
- **House default wall height** (owner, Phase 4.4): an optional house property, "Default wall height"; when unset, 2.40 m. Every new wall starts from it (fill, new walls from commands); while raising a new wall with Push/pull, it is a height snap ("Default height 2.40 m") after existing wall heights. Existing walls keep their heights.
- **Fill walls** (W, paint bucket, wall tools): clicking the floor of the room being edited replaces all its walls with one wall per boundary piece of the floor outline (straight edges and circle arcs, outer outline and holes), ends attached to the corners, at the default wall height. Hovering the floor tints it (the hover tint) and draws the outline that becomes walls as a bold (3 px) line in the strong accent; the hint names the room, the wall count, and the height (Phase 5.15). Thickness, alignment, and materials are copied from the room's previous walls when they all agree, otherwise 200 mm, outside, default paint. Doors and windows on the removed walls go with them; a notification says how many, and one Undo restores everything. Other rooms' walls are never touched.
- Curved walls on circle outlines are decided in [D20](../../decisions.md#d20-walls-on-circles).
- Select an existing wall to inspect and edit its height in the properties panel.
- Wall segments can have independent heights.

Walls also have thickness, alignment (outside by default, inside, or center), and separate interior/exterior materials. Outside alignment suits measured interior dimensions. RealFloor extends beneath outward wall thickness without changing the floor shape. See [wall alignment and flooring support](../features/materials-and-objects.md#2-wall-thickness-alignment-and-flooring-support).

Curved walls follow a circle's arc (positions are arc length from the circle's local 0°; a full ring starts and ends there); they take push/pull, trim, and split like straight walls, and openings on them are deferred ([D20](../../decisions.md#d20-walls-on-circles)). Corners are built by the 2.5D wall union in [shared walls](../features/shared-walls.md#building-realallwalls).

### Selection and bulk height editing

- List the wall segments beneath the area's Walls group in the context tree.
- Select one segment or multiple segments.
- Clicking the Walls group name while in Room Editor selects all walls of that area.
- **⌘A** in the Room Editor selects all walls in the active area so their height can be changed together. It must not capture the shortcut while typing in a property field.
- The lower panel supports inspecting individual height and setting a common height for a multi-selection. Differing values show **Mixed** ([property system](../property-system.md#the-property-panel)).

### Trim, extend, remove, and split walls with their vertical lines

Every wall has two **vertical end lines**. They are the handles for cutting walls back along their edge:

- **Trim.** Click a vertical end line and move it left or right along the wall's edge (click again, or type a distance and press Enter). The wall's span shrinks or grows anywhere between its two end lines, up to the full source edge. A gap opens between it and the neighboring wall. The floor shape is unchanged; RealFloor and RealAllWalls follow the new span.
- **Remove by pushing through.** Pushing an end line all the way onto the wall's other end line removes the wall, as one undoable command. The floor edge stays and can be raised again later.
- **Extend.** Dragging an open end line outward lengthens the wall along its edge, up to the edge's end. Dragging it past a corner onto the next floor-shape edge creates a **new wall section** on that edge, copying the original wall's height, thickness, alignment, and materials. The new section is its own wall anchored to its own edge; extending and creating it is one undoable command.
- **Re-extrude.** Any floor-shape edge without a wall, or a stretch of edge left bare by trimming, can be pulled upward again to raise a new wall, as when the wall was first created.
- **Split** (review enrichment). A Split action on a selected wall inserts a vertical line at the pointer or at a typed distance. The wall becomes two walls on the same source edge, each with its own span, height, and materials, and each keeps the hosted openings that fall within it. Trimming the two halves apart cuts a gap in the middle of the wall, for example a passage.
- **Snapping.** With Magnetic on, a dragged end line snaps to nearby vertical lines: other wall ends, opening edges, floor-shape vertices, and guides. Typed distances are also accepted while dragging. With Magnetic off, the drag is freeform.
- **Openings.** An opening that no longer fits inside the trimmed span is kept, flagged, and not cut ([materials and objects](../features/materials-and-objects.md#4-wall-children-wallable)).

Example: draw a 4 × 3 m rectangle floor and raise all four edges as 10 cm outside-aligned walls. Click the right end line of the front wall, move toward its left end line, type `1.2m`, and press Enter. The front wall now covers 2.8 m and leaves a 1.2 m opening at the corner. Pushing it all the way onto the left end line removes the front wall.

A room with only three walls has two open ends at the bare edge. Drag either open end line along the corner onto the bare edge to add a wall section there, or pull the bare edge up to raise a complete new wall.

Several walls can share one source edge as long as their spans don't overlap ([D04](../../decisions.md#d04-footprints-walls-and-stable-boundaries)). Snapped end lines are positioned, not permanently linked, in MVP.

## Materials and object editing

- Flooring selection exposes its material/image texture.
- A selected stair shows its template's parameters and the Staircase group (Cut floor above, Cut floor below); a floor opening shows its size. Areas have no type selector (Phase 16.14).
- Wall selection exposes thickness, alignment (inside/outside/center), and separate interior/exterior materials alongside its height.
- Doors/windows appear under their host wall. Select one to show its template-defined properties and limits and its own box and stretch handles, not its wall's highlight (*Wall items select as themselves*, below); move it along the wall with Nudge or its Move cross. Resizing or moving it updates its wall cutout and generated geometry together.
- `Areable` objects such as a sofa, TV, picture, or air conditioner use template-defined properties and placement without wall cutouts. A wall-mounted `Areable` remains under its area with a reference to the attachment wall. They are inserted from a template picker and moved with the same handle/drag tools as other objects.
- Every object is a glTF template ([D17](../../decisions.md#d17-object-asset-format-and-template-metadata)). Phase 1 places built-in templates; in Phase 2, imported GLB/glTF or STL models are prepared in the [Object Editor](object-editor.md), join the house's template library, and are then placed the same way in any area. See [object templates](../features/object-templates.md) for direction, resizing, flips, attachment, and default placement. Wall attachment alone does not make an object `Wallable`; that contract is for opening-producing doors/windows.
- Carpets (MVP Phase 1) are `Floorable`: flat 2D shapes hosted by the area's floor, listed under its Floor row, with one combined footprint per carpet, their own position, and a surface material.
- Lights belong to the area and expose visible-fixture choice or an invisible 3D source, full output, brightness, and supported white/temperature/RGB modes. Include linear lighting with editable length and placement. Fixture templates supply default attachments; authored values support preview and fallback without Home Assistant. A light's **Mount** (Free / Wall, Phase 17.3) puts it on one face of one of its room's walls, interior or exterior ([wall-mounted lights](../features/lighting.md#wall-mounted-lights-phase-173)); choosing a wall-only fixture (the outdoor lantern, up/down light and bulkhead) mounts it on the nearest wall's exterior face at once. See [lighting](../features/lighting.md). Editor helpers make invisible sources selectable and are excluded from final images.
- Lights can form groups on the active floor. A group is a selection and bulk-edit set with no override layer ([D08](../../decisions.md#d08-lighting-and-groups)).
- Post-MVP: objects may declare HA controllables ([controllables](../../home-assistant/controllables.md)). The MVP keeps stable object IDs only and has no controllables UI.

See the [materials and objects specification](../features/materials-and-objects.md) for contracts and resizing behavior. These capabilities add no toolbar buttons or editor modes beyond those described here.

**Objects in the view** (owner, Phase 5 follow-up): hovering an object outlines its box (in its own axes, from the built model) and names it; a selected object shows its box in the selection tone, and a single floor or overhead object also a **Move** cross at its bottom centre. Turning is Rotate (Q). Wall-hosted objects slide along their wall with Nudge.

**Wall items select as themselves** (Phase 15.8, owner report 2026-11-18): a selected door, window, glazed door, or other opening, and a wall-hung object (TV, frame, cabinet), shows **its own** box like any other object, never its wall's highlight; the wall highlights only when the wall itself is selected. Hovering one outlines its box. A single selected wall item in Select also shows stretch handles on the box's middle plane parallel to the wall: the two side handles where its template declares a width parameter, the top and bottom handles where it declares a height, the four corners where it declares both, and a **Move** cross in the centre that slides it along its wall (as Nudge does). Top view sees the wall edge-on, so it shows only the two side handles and the cross. Hovering a handle highlights it, names it ("Resize Door: side"), and shows the resize cursor for its on-screen direction. Dragging (or click–move–click) a side or corner changes the width and/or height with the opposite side fixed, or about the centre with **Option**; the pointer is read on the box's plane (along the wall at the handle's height, up the vertical through the handle). The sizes stay within the template's limits and the box within its wall's span and between the floor and the wall top (or the item's own top if it is higher). With Magnetic on, a side follows the floor-plan inference and a top or bottom snaps to the wall top and the other openings' sills and heads on the same wall; **Ctrl** stretches without snapping. Typed values are the property panel's sizes: one value for a side (its width or height), `W x H` for a corner. The item stretches live with a `W × H` readout; a click, release after a drag, or Enter commits **one undo step** that sets the size parameters and the position that keeps the fixed side in place (`distanceAlongWallMm`/`bottomMm` for an opening, `positionMm.x`/`elevationMm` for a wall-hung object); Escape cancels. The wall face view shows only the box (its own tools edit the face); with walls off an opening is not drawn and shows no box. The tree, properties panel, Actions menu, and keys are unchanged. Implementation: `tools/wallItemBox.ts`, `tools/wallItemSelectOps.ts`; checked by `npm run editor:selection`.

## Lights in the editor

Lights are found and edited through **pins** and **handles** (owner, Phase 5.11–5.12); the full rules, sizes, and snaps are in [lighting: finding and picking lights](../features/lighting.md#finding-and-picking-lights-in-the-editor) and [light handles](../features/lighting.md#light-handles).

- Every light has a pin (badge, dashed stem, floor dot; a capsule along a linear light), drawn and picked in screen space only while the header's light controls are on **Shown** or **Focus**. The default is **Hidden**, so lights are then selected by their fixtures or the tree. A linear light wins the click anywhere on its capsule; point and spot lights keep the normal nearest-first order; repeated clicks on stacked pins cycle through them ("1 of 3").
- Hovering a light names it and its height next to the pointer.
- A selected light shows Move, Raise (3D only), Stretch (linear lights), and Aim (spots) handles, again only with pins shown; turning is Rotate. Each drag is one undo step; Raise applies to every selected light.
- Pins and handles are helpers: never in PNG exports or renders.

## Selection panel and actions

- **Header:** a properties icon and the selection's name (else its kind); several items read "2 × Wall" or "3 items: 2 Carpets, 1 Light" (owner, Phase 5 follow-up). With nothing selected: "Properties" and a hint.
- **Body:** the [schema-driven property panel](../property-system.md#the-property-panel) as a flat list of collapsible groups. Several items of one type edit together (differences show **Mixed**); items of different types show only the properties they share, else a short message.
- **Details** after the properties: geometry warnings for the selection (orphan or ambiguous walls, opening and feature conflicts, doors, windows, objects and lights above the roof, Phase 19.2), derived facts for a single item, the house's libraries (house selected), and a light group's members (light group selected).
- **Actions** in an **Actions** button (secondary style, owner 2026-11-16: the ⋯ icon was easy to miss) at the right of the panel header (Phase 7.6, owner 2026-11-16: expandable, not always visible): Edit object / version updates (template instances), Snap to shared wall, repair actions (Reassign to an edge…, Clear all guides), **Group N objects** (two or more floor objects of one area) and **Ungroup**, **Duplicate area** (one area),, and, always last, **Delete** in the danger tone with a trash icon (anything except the house and floor surfaces; "Delete floor", "Delete N items"). The menu opens and closes with the mouse and keyboard; the Delete key still deletes the selection directly.

## Status bar and notices

The viewport shows the active tool's hint, readout, and inference cue next to the pointer. Notices (why an edit was rejected, "Undid: …", save failures) float as a dismissible toast over the viewport's bottom centre rather than taking a row of their own (owner, Phase 5 follow-up).

## Shared editing contract

Save timing, previews, cancellation, undo/redo, and conflict feedback follow the [editing lifecycle](../editing-lifecycle.md) ([D09](../../decisions.md#d09-saving-cancellation-and-model-undo)). Source/derived-data ownership is described in the [document model](../model.md#source-and-derived-data-boundary). No tool invents its own behavior.

## Verification scenarios

- Selecting a house opens its builder; a new house has exactly one floor, `Etage1`, and the last floor cannot be deleted.
- The tree places floors directly under the house and areas under their floor, with separate Floor and Walls entries per area.
- A name click updates selection/properties; house/floor frame actions return to the overview and fit the floor; a room's frame action fits and selects it; Floor and Walls rows have no frame action.
- Double-click a room, then its carpet, then away twice: overview → Room Editor → Carpet Editor → Room Editor → overview, with the header level and breadcrumb following; the same holds for a wall (face view) and a feature (Feature Editor), and for tree rows (double-click/Enter). Pressing Escape repeatedly at any level (Select active, nothing selected) walks back up the same way, one level per press.
- Shapes support numeric mm/cm/m/in/ft sizing with live mixed-unit conversion into the saved project unit and consistent metric dimensions, plus drag resizing; disabling Magnetic permits movement without proximity snapping.
- Leaving Room Editor calculates RealFloor; returning restores the editable source shapes, vertices, and transforms.
- An area without walls renders RealFloor equal to its floor shape; outside- and center-aligned walls enlarge RealFloor only along their spans.
- A shape edit that removes a wall's source edge from the boundary keeps that wall and its openings and flags it for repair.
- Moving a group preserves its children's local geometry; changing display units leaves its canonical millimeter dimensions unchanged.
- A straight boundary can produce a wall via click–move–click or a typed height; Shift-extrude and scoped ⌘A support bulk height changes; individual heights remain editable.
- After the first click locks an operation, typing `3m` and pressing Enter moves or extrudes exactly 3 m in the locked direction; Escape cancels with no history entry.
- Dragging a wall's vertical end line trims its span and opens a gap; pushing it onto the other end line removes the wall; dragging an open end past a corner adds a wall section on the next edge; Split plus trim cuts a mid-wall gap. With Magnetic on, end lines snap to nearby vertical lines.
- Moving an area moves its contents together; the Touching detent gives summed thickness, then Full clash gives one shared wall of the larger thickness, without modifying source dimensions.
- Each tree row's Add dropdown lists only its allowed child types; adding an area creates `Area N` at the view center and opens Room Editor.
- With two saved floors, switching between them shows only the active floor and its lights/helpers; selecting the house never reveals a stacked view.
- Top view stays top-down; switching to 3D permits orbiting the active floor while preserving geometry, dimensions, and selection.
- Camera gestures do not also drag an editable edge; edge/handle manipulation works from the supported views.
- Room Editor in 3D supports rotation, pan, and zoom without changing the wall model; choosing a wall tool switches to 3D.

## Interaction details left to implementation

Defaults for all former open items are set in [D04](../../decisions.md#d04-footprints-walls-and-stable-boundaries), [D05](../../decisions.md#d05-walls-between-adjacent-areas), [D09](../../decisions.md#d09-saving-cancellation-and-model-undo), [D14](../../decisions.md#d14-project-management-and-names), and [D16](../../decisions.md#d16-interaction-defaults-and-support-limits). What remains are visual-design and tuning details: icon ordering and flyouts, selection highlighting, how much surrounding geometry stays visible in each editor, and the tuned snap/gesture values.
