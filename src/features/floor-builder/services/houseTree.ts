// Builds the house context tree (spec/builder/screens/floor-builder.md#house-context-hierarchy) as plain data.
import type { IconName } from "../../../design-system/components/Icon/icons";
import type { MenuButtonItem } from "../../../design-system/components/MenuButton/menuButtonItem";
import type { HouseDocument } from "@shared/domain/schemas/house";
import type { AreaValue } from "@shared/domain/schemas/area";
import { indexEntities } from "@shared/domain/house/entityIndex";
import { isHideableKind } from "@shared/domain/house/visibility";
import { effectKindLabel } from "@shared/domain/schemas/effects";
import { circleArcEdgeKey } from "@shared/geometry/shapeOutline";
import { wallLabel } from "./labels";
import { maxEffectsPerObject } from "@shared/domain/commands/effectCommands";
import { groundFloorOf, isYard } from "@shared/domain/house/yards";
import { canAddRoof, roofsOf } from "@shared/domain/house/roofs";

export type TreeMagnifier = "frameFloor" | "activateFloor" | "frameArea";

export type TreeNode = Readonly<{
  id: string;
  label: string;
  icon: IconName;
  warning?: boolean;
  /** Greyed label: a light switched off, an inactive guide, or a saved-Hidden item (Phase 7.5). */
  muted?: boolean;
  /** Not drawn in the view (Phase 7.5): hidden for the session, saved Hidden, or inside a hidden row. */
  faded?: boolean;
  /** Hideable rows (P5) get the eye; `hidden` is the session Hide of this row itself. */
  hide?: Readonly<{ hidden: boolean }>;
  /** Outside the area being edited: greyed, not selectable, no actions. */
  disabled?: boolean;
  badge?: string;
  /** Row view action, drawn with the Fit-to-screen frame icon on every row (owner, 2026-11-15). */
  magnifier?: Readonly<{ action: TreeMagnifier; label: string }>;
  deletable?: boolean;
  addItems?: readonly MenuButtonItem[];
  children?: readonly TreeNode[];
}>;

export const syntheticRow = {
  walls: (areaId: string): string => `row:walls:${areaId}`,
  objects: (areaId: string): string => `row:objects:${areaId}`,
  lights: (areaId: string): string => `row:lights:${areaId}`,
  carpets: (areaId: string): string => `row:carpets:${areaId}`,
  lightGroups: (floorId: string): string => `row:lightGroups:${floorId}`,
  guides: (floorId: string): string => `row:guides:${floorId}`,
} as const;

export type SyntheticRow = Readonly<{
  kind: "walls" | "objects" | "lights" | "carpets" | "lightGroups" | "guides";
  ownerId: string;
}>;

export const parseSyntheticRow = (id: string): SyntheticRow | undefined => {
  const match = /^row:(walls|objects|lights|carpets|lightGroups|guides):(.+)$/.exec(id);
  const kind = match?.[1];
  const ownerId = match?.[2];
  if (kind === undefined || ownerId === undefined) return undefined;
  if (
    kind === "walls" ||
    kind === "objects" ||
    kind === "lights" ||
    kind === "carpets" ||
    kind === "lightGroups" ||
    kind === "guides"
  )
    return { kind, ownerId };
  return undefined;
};

export type TreeIssues = Readonly<{ orphanWallIds: ReadonlySet<string>; flaggedIds: ReadonlySet<string> }>;

const areaNode = (area: AreaValue, issues: TreeIssues): TreeNode => {
  // A grouped object, light, or carpet is listed once, inside its group (Phase 7.3, owner J2).
  const grouped = new Set((area.objectGroups ?? []).flatMap((group) => group.memberIds));
  const carpetNode = (carpet: AreaValue["floor"]["carpets"][number]): TreeNode => ({
    id: carpet.id,
    label: carpet.name,
    icon: "carpet",
    deletable: true,
  });
  const lightNode = (light: AreaValue["lights"][number]): TreeNode => ({
    id: light.id,
    deletable: true,
    label: light.name,
    icon: "light",
    muted: !light.defaults.enabled,
  });
  // A yard (Phase 17.2): fences for walls, gates for doors, pathways for carpets; no stairs or floor openings.
  const yard = isYard(area);
  const looseCarpets = area.floor.carpets.filter((carpet) => !grouped.has(carpet.id));
  const looseLights = area.lights.filter((light) => !grouped.has(light.id));
  const walls: TreeNode[] = area.walls.map((wall, index) => ({
    id: wall.id,
    label: wallLabel(area, wall, index),
    icon: "wall",
    deletable: true,
    warning: issues.orphanWallIds.has(wall.id) || issues.flaggedIds.has(wall.id),
    // Doors and windows on curved walls are deferred (D20).
    addItems:
      wall.sourceEdge.edge === circleArcEdgeKey
        ? undefined
        : yard
          ? [{ id: "add:gate", label: "Gate…", icon: "gate" }]
          : [
              { id: "add:door", label: "Door…", icon: "door" },
              { id: "add:window", label: "Window…", icon: "window" },
              { id: "add:wallFeature", label: "Feature", icon: "reliefBox" },
            ],
    children:
      wall.objects.length === 0 && (wall.reliefs ?? []).length === 0
        ? undefined
        : [
            ...wall.objects.map((opening): TreeNode => ({
              id: opening.id,
              deletable: true,
              label: opening.name,
              icon: yard ? "gate" : opening.templateId.includes("door") ? "door" : "window",
              warning: issues.flaggedIds.has(opening.id),
            })),
            // Boxes and niches on the wall's faces (Phase 5.0).
            ...(wall.reliefs ?? []).map((relief): TreeNode => ({
              id: relief.id,
              deletable: true,
              label: relief.name,
              icon: relief.depthMm < 0 ? "reliefNiche" : "reliefBox",
              warning: issues.flaggedIds.has(relief.id),
            })),
          ],
  }));
  const children: TreeNode[] = [
    {
      id: area.floor.id,
      label: "Floor",
      icon: "grid",
      addItems: yard
        ? [{ id: "add:pathway", label: "Pathway", icon: "carpet" }]
        : [{ id: "add:carpet", label: "Carpet", icon: "carpet" }],
      children: looseCarpets.length === 0 ? undefined : looseCarpets.map(carpetNode),
    },
    {
      id: syntheticRow.walls(area.id),
      label: yard ? "Fences" : "Walls",
      icon: yard ? "yard" : "wall",
      badge: walls.length === 0 ? undefined : `(${String(walls.length)})`,
      children: walls.length === 0 ? undefined : walls,
    },
  ];
  if (area.objects.length > 0) {
    const objectNode = (object: AreaValue["objects"][number]): TreeNode => ({
      id: object.id,
      deletable: true,
      label: object.name,
      // Stairs and floor openings are objects (Phase 16.14).
      icon: object.floorCut === "stair" ? "stairs" : object.floorCut === "opening" ? "reliefNiche" : "sofa",
      warning: issues.flaggedIds.has(object.id),
      // + on the row adds an ambient effect (owner: like other rows' Add menus, not only through ⋯).
      addItems:
        (object.effects ?? []).length >= maxEffectsPerObject
          ? undefined
          : [{ id: "add:effect", label: "Effect", icon: "wind" }],
      // Ambient effects (D24) are rows of their own under their object.
      children:
        (object.effects ?? []).length === 0
          ? undefined
          : (object.effects ?? []).map((effect) => ({
              id: effect.id,
              deletable: true,
              label: effectKindLabel(effect.kind),
              icon: "wind",
              muted: !effect.enabled,
            })),
    });
    children.push({
      id: syntheticRow.objects(area.id),
      label: "Objects",
      icon: "sofa",
      children: [
        // A group (spec/builder/features/object-groups.md) lists its members under it.
        ...(area.objectGroups ?? []).map((group): TreeNode => ({
          id: group.id,
          deletable: true,
          label: group.name,
          icon: "sofa",
          badge: `(${String(group.memberIds.length)})`,
          children: [
            ...area.objects.filter((object) => group.memberIds.includes(object.id)).map(objectNode),
            ...area.lights.filter((light) => group.memberIds.includes(light.id)).map(lightNode),
            ...area.floor.carpets.filter((carpet) => group.memberIds.includes(carpet.id)).map(carpetNode),
          ],
        })),
        ...area.objects.filter((object) => !grouped.has(object.id)).map(objectNode),
      ],
    });
  }
  if (looseLights.length > 0) {
    children.push({
      id: syntheticRow.lights(area.id),
      label: "Lights",
      icon: "light",
      children: looseLights.map(lightNode),
    });
  }
  return {
    id: area.id,
    deletable: true,
    label: area.name,
    icon: yard ? "yard" : "rectangle",
    warning: area.floor.shapes.length === 0,
    magnifier: { action: "frameArea", label: `Fit ${area.name} to screen` },
    addItems: yard
      ? [
          { id: "add:object", label: "Object…", icon: "sofa" },
          { id: "add:light", label: "Light", icon: "light" },
          { id: "add:canopy", label: "Canopy", icon: "roof" },
        ]
      : [
          { id: "add:object", label: "Object…", icon: "sofa" },
          { id: "add:staircase", label: "Staircase…", icon: "stairs" },
          { id: "add:floorOpening", label: "Floor opening…", icon: "reliefNiche" },
          { id: "add:light", label: "Light", icon: "light" },
          { id: "add:canopy", label: "Canopy", icon: "roof" },
        ],
    children,
  };
};

const addYardItem: MenuButtonItem = { id: "add:yard", label: "Yard", icon: "yard" };
/** Add canopy (Phase 19.3): an attached roof over the row's area, or at the floor's centre. */
const addCanopyItem: MenuButtonItem = { id: "add:canopy", label: "Canopy", icon: "roof" };

export const buildHouseTree = (house: HouseDocument, issues: TreeIssues): TreeNode => ({
  id: house.id,
  label: house.name,
  icon: "home",
  magnifier: {
    action: "frameFloor",
    label: house.floors.length > 1 ? "Show the whole house" : "Show the active floor",
  },
  addItems: [{ id: "add:floor", label: "Floor", icon: "layers" }],
  children: house.floors.map((floor) => {
    const ground = groundFloorOf(house.floors)?.id === floor.id;
    const children: TreeNode[] = floor.areas.map((area) => areaNode(area, issues));
    if (floor.lightGroups.length > 0) {
      children.push({
        id: syntheticRow.lightGroups(floor.id),
        label: "Light groups",
        icon: "light",
        children: floor.lightGroups.map((group) => ({
          id: group.id,
          deletable: true,
          label: group.name,
          icon: "light",
          badge: `(${String(group.memberIds.length)})`,
        })),
      });
    }
    if (floor.guides.length > 0) {
      children.push({
        id: syntheticRow.guides(floor.id),
        label: "Guides",
        icon: "ruler",
        children: floor.guides.map((guide, index) => ({
          id: guide.id,
          deletable: true,
          label: `${guide.kind === "line" ? "Guide line" : "Guide point"} ${String(index + 1)}`,
          icon: "ruler",
          muted: !guide.visible,
        })),
      });
    }
    // Roofs (Phase 19.1): a row each under their floor; double-click or Enter opens the roof's editing level.
    // Phase 19.3: its holes and roof windows under it, and Roof window… in its + menu; canopies are roofs too.
    for (const roof of roofsOf(floor)) {
      const items: TreeNode[] = [
        ...(roof.holes ?? []).map((hole): TreeNode => ({
          id: hole.id,
          deletable: true,
          label: hole.name,
          icon: "reliefNiche",
          warning: issues.flaggedIds.has(hole.id),
        })),
        ...(roof.windows ?? []).map((window): TreeNode => ({
          id: window.id,
          deletable: true,
          label: window.name,
          icon: "window",
          warning: issues.flaggedIds.has(window.id),
        })),
      ];
      children.push({
        id: roof.id,
        deletable: true,
        label: roof.name,
        icon: "roof",
        warning: issues.flaggedIds.has(roof.id),
        addItems: [{ id: "add:roofWindow", label: "Roof window…", icon: "window" }],
        children: items.length === 0 ? undefined : items,
      });
    }
    return {
      id: floor.id,
      deletable: house.floors.length > 1,
      label: floor.name,
      icon: "layers",
      magnifier: { action: "activateFloor", label: `Show ${floor.name}` },
      addItems: [
        { id: "add:area", label: "Area", icon: "rectangle" },
        // Yards only on the ground floor (Phase 17.2).
        ...(ground ? [addYardItem] : []),
        { id: "add:lightGroup", label: "Light group", icon: "light" },
        // Add roof on the top floor (Phase 19.1), once.
        ...(canAddRoof(house, floor) ? [{ id: "add:roof", label: "Roof", icon: "roof" } as const] : []),
        // An attached canopy (19.3) on any floor.
        addCanopyItem,
      ],
      children: children.length === 0 ? undefined : children,
    };
  }),
});

/**
 * Editor sessions (Room Editor) lock the tree to the focused area: every row outside the area's
 * subtree is disabled and loses its magnifier and Add menu. Returns the tree and the disabled row IDs.
 */
export const lockTreeToArea = (
  root: TreeNode,
  areaId: string | undefined,
): Readonly<{ root: TreeNode; disabledIds: readonly string[] }> => {
  if (areaId === undefined) return { root, disabledIds: [] };
  const disabledIds: string[] = [];
  const lock = (node: TreeNode): TreeNode => {
    if (node.id === areaId) return node;
    disabledIds.push(node.id);
    return {
      ...node,
      disabled: true,
      magnifier: undefined,
      deletable: undefined,
      addItems: undefined,
      children: node.children?.map(lock),
    };
  };
  return { root: lock(root), disabledIds };
};

/**
 * Every row that contains one of `ids` (Phase 7.4, tree reveal): the floor, room, Objects row, group, wall… above
 * each selected row, for expanding them and tinting them. IDs that are not tree rows are ignored.
 */
export const treeAncestors = (root: TreeNode, ids: readonly string[]): ReadonlySet<string> => {
  const wanted = new Set(ids);
  const found = new Set<string>();
  const walk = (node: TreeNode, path: readonly string[]): void => {
    if (wanted.has(node.id)) for (const id of path) found.add(id);
    for (const child of node.children ?? []) walk(child, [...path, node.id]);
  };
  walk(root, []);
  return found;
};

/** Hide and Hidden in the tree (Phase 7.5): session-hidden IDs and every entity not drawn in the view. */
export type TreeVisibility = Readonly<{ hiddenIds: ReadonlySet<string>; offIds: ReadonlySet<string> }>;

/**
 * Marks the rows of hideable entities (eye action), greys saved-Hidden ones, and fades every row whose entity is
 * not drawn. Rows that are not entities (Walls, Objects…) fade when all their children do.
 */
export const withVisibility = (
  root: TreeNode,
  house: HouseDocument,
  visibility: TreeVisibility,
): TreeNode => {
  const entities = indexEntities(house);
  const mark = (node: TreeNode): TreeNode => {
    const children = node.children?.map(mark);
    const ref = entities.get(node.id);
    const value: unknown = ref?.value;
    const savedHidden =
      typeof value === "object" && value !== null && "hidden" in value && value.hidden === true;
    const hideable = ref !== undefined && isHideableKind(ref.kind);
    const faded =
      visibility.offIds.has(node.id) ||
      (ref === undefined &&
        children !== undefined &&
        children.length > 0 &&
        children.every((child) => child.faded));
    if (!hideable && !faded && children === node.children) return node;
    return {
      ...node,
      ...(children === undefined ? {} : { children }),
      ...(savedHidden ? { muted: true } : {}),
      ...(faded ? { faded: true } : {}),
      ...(hideable ? { hide: { hidden: visibility.hiddenIds.has(node.id) } } : {}),
    };
  };
  return mark(root);
};
