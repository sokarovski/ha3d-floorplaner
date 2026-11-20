# Object groups

Updated: 2026-11-19.

Status: **resolved by the owner (2026-11-16) and implemented, awaiting owner check.** Field names are implementation conventions.

## What it is

A group is a named set of two or more things of one area — floor or overhead objects, and since Phase 7.3 also its lights and carpets, with at least one object (a dining table and its chairs, a stool and its plant). It is selected, moved, and turned as one; every member keeps its own template, placement, and properties. Grouping changes no geometry.

## Model

`area.objectGroups` is optional (older houses stay valid, no schema version change): `{ id (og_…), name, memberIds[] (≥ 2 objects of this area, floor or overhead hosted) }`. An object belongs to at most one group; grouping it again takes it out of its old group. A group with fewer than two members is removed automatically (deleting a member, or deleting an object from the tree). Wall-hosted objects and openings cannot be grouped.

The group's properties panel lists its name and its members (reference editor), so membership can be edited there too.

## Editing

1. **Group**: select two or more objects of one area (Shift-click, or tree rows) and press **Group N objects** in the selection panel. The group is selected.
2. **Select**: clicking any member selects the group (all members show their boxes).
3. **Move** (Nudge) and **Rotate** act on the whole group: every member shifts by the same offset, or swings counterclockwise about the group's box centre and turns by the same angle. One undo step each, with the same Shift/Ctrl behaviours as single objects.
4. **Open a group**: double-click a member to select that member alone and move or edit it; clicks on its siblings now select them individually. The header shows "Group Editor" and the group in the breadcrumb. Done, Escape (nothing running or selected), the room link, or a double-click away from the group closes it again with the group selected (Phase 7.1).
5. **Ungroup**: select the group (or one member) and press **Ungroup**. Deleting a group row in the tree ungroups it; it never deletes the members.
6. **Tree**: the area's Objects row lists each group with its members under it (objects, then lights, then carpets), then the ungrouped objects. A grouped light or carpet is listed only inside its group, not under Lights or Floor, so nothing appears twice (owner J2). Clicking a member row selects just that member; ⌘- or Shift-click selects several rows, so a group can be made from the tree.
7. **Lights and carpets** (Phase 7.3, a lamp or a rug moves with its table): clicking a grouped light or carpet selects the group; Move and Rotate move and turn them with the objects (a carpet turns rigidly with its pieces, a light keeps its beam relative to the group). The group's box is still drawn around its objects. A selected group's lights take the selection accent.

J2 (owner, 2026-11-16: grouped objects "presented again" in their area) could not be reproduced in the final 5.17 tree: the stored house lists each member once. It is treated as fixed; owner to confirm.

## Out of scope for now

Nested groups, groups across areas or floors, and resizing a group as a whole.

Owner: [object models](../object-models.md), [floor builder](../screens/floor-builder.md).
