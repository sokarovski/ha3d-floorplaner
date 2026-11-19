// The Settings list's search and grouping (Phase 10.8, spec/home-assistant/bindings.md#editor): which bindable
// things match a search, and how they group in the tree (by room, then Lights, Objects, and Doors and windows),
// and the split screen's selection (10.9: the House node or one thing, and which
// room and group open to show it). Pure, so `npm run ha:conditions` checks it; the editor draws the result.
import type { BindingTarget, TargetKind } from "./bindingTargets";

/** A listed thing with what the search reads besides its name and room. */
export type ListItem = Readonly<{
  target: BindingTarget;
  /** The entities its binding uses (state entity, state mappings, presence). */
  entityIds: readonly string[];
  /** Those entities' friendly names, as HA knows them. */
  entityNames: readonly string[];
  /** Its summary is not "Not connected". */
  connected: boolean;
}>;

export type TreeGroupKey = "lights" | "objects" | "openings";

export type TreeGroup = Readonly<{
  key: TreeGroupKey;
  title: string;
  /** The rows shown (all of them, or the matches while searching). */
  items: readonly ListItem[];
  /** The group's things, matching or not ("n of m connected"). */
  total: number;
  connected: number;
}>;

export type TreeRoom = Readonly<{
  id: string;
  name: string;
  /** The room's own row, or null while a search hides it. */
  room: ListItem | null;
  /** The non-empty groups (while searching: those with matches). */
  groups: readonly TreeGroup[];
  total: number;
  connected: number;
}>;

const treeGroups: readonly (readonly [TreeGroupKey, string])[] = [
  ["lights", "Lights"],
  ["objects", "Objects"],
  ["openings", "Doors and windows"],
];

/** The search's words, lower case; an empty or blank search has none. */
export const searchWords = (query: string): readonly string[] =>
  query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== "");

/** Every word occurs in the name, the room, a bound entity ID, or an entity's friendly name (ignoring case). */
export const matchesSearch = (item: ListItem, words: readonly string[]): boolean => {
  if (words.length === 0) return true;
  // A plain search word must start a word of some field ("door" finds "Front door" and "binary_sensor.front_door",
  // not "AC indoor unit"); a word with "." or "_" (part of an entity id) may appear anywhere.
  const fields = [item.target.name, item.target.areaName, ...item.entityIds, ...item.entityNames].map(
    (field) => field.toLowerCase(),
  );
  const fieldWords = fields.flatMap((field) => field.split(/[^\p{L}\p{N}]+/u));
  return words.every((word) =>
    /[._]/.test(word)
      ? fields.some((field) => field.includes(word))
      : fieldWords.some((fieldWord) => fieldWord.startsWith(word)),
  );
};

export const treeGroupOf = (target: BindingTarget): TreeGroupKey | null =>
  target.kind === "lights"
    ? "lights"
    : target.kind === "objects"
      ? target.opening === true
        ? "openings"
        : "objects"
      : null;

/**
 * Rooms in floor order (the items' order), each with its own row and its non-empty groups. While searching,
 * a room shows only its matches and a room without any is left out.
 */
export const bindingTree = (items: readonly ListItem[], query: string): readonly TreeRoom[] => {
  const words = searchWords(query);
  const searching = words.length > 0;
  return items
    .filter((item) => item.target.kind === "areas")
    .map((room): TreeRoom => {
      const inRoom = items.filter(
        (item) => item.target.kind !== "areas" && item.target.areaId === room.target.id,
      );
      const groups = treeGroups.flatMap(([key, title]): TreeGroup[] => {
        const all = inRoom.filter((item) => treeGroupOf(item.target) === key);
        const shown = all.filter((item) => matchesSearch(item, words));
        if (shown.length === 0) return [];
        return [
          {
            key,
            title,
            items: shown,
            total: all.length,
            connected: all.filter((item) => item.connected).length,
          },
        ];
      });
      const everything = [room, ...inRoom];
      return {
        id: room.target.id,
        name: room.target.name,
        room: matchesSearch(room, words) ? room : null,
        groups,
        total: everything.length,
        connected: everything.filter((item) => item.connected).length,
      };
    })
    .filter((room) => !searching || room.room !== null || room.groups.length > 0);
};

/** A room's or group's count, small after its name: "(2 of 28)". */
export const countText = (connected: number, total: number): string =>
  `(${String(connected)} of ${String(total)})`;

/** What the Settings split screen shows on the right (10.9): the House node, the shown floor (13.7), or one thing. */
export type SettingsSelection =
  Readonly<{ kind: "house" }> | Readonly<{ kind: "floor" }> | Readonly<{ kind: TargetKind; id: string }>;

export const houseSelection: SettingsSelection = { kind: "house" };

export const floorSelection: SettingsSelection = { kind: "floor" };

export const isSelected = (selection: SettingsSelection, target: BindingTarget): boolean =>
  selection.kind === target.kind && "id" in selection && selection.id === target.id;

/** The tree's room to open (and the group in it, `room/group`) so a selected thing's row shows. */
export const revealKeys = (target: BindingTarget): Readonly<{ room: string; group: string | null }> => {
  if (target.kind === "areas") return { room: target.id, group: null };
  const group = treeGroupOf(target);
  return { room: target.areaId, group: group === null ? null : `${target.areaId}/${group}` };
};
