// Reading Home Assistant dashboards over the websocket: which dashboards exist, their tabs (views), and the
// cards of a tab. Shared by the room panel, the floor widgets (13.7), and the Settings tab pickers.
import type { HaDashboardValue, HaFloorWidgetPositionValue } from "@shared/domain/schemas/homeAssistant";
import type { Hass } from "./hassStore";

/** URL path of HA's default dashboard. */
export const defaultDashboardPath = "lovelace";

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const textOf = (value: unknown): string => (typeof value === "string" ? value : "");

/** Case and separators ignored: "Living Room", "living-room" and "living_room" match. */
const normalize = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, "");

export type DashboardInfo = Readonly<{ urlPath: string; title: string }>;

/**
 * One card with the size its config sets on the section grid (12 columns); null where the config says nothing,
 * and the card's own `getGridOptions()` default applies.
 */
export type DashboardCard = Readonly<{
  config: Record<string, unknown>;
  columns: number | null;
  rows: number | null;
}>;

export type DashboardSection = Readonly<{ columnSpan: number; cards: readonly DashboardCard[] }>;

/** A tab's layout as HA draws it: sections in columns, masonry columns, or one full-size card. */
export type ViewLayout =
  | Readonly<{ kind: "sections"; maxColumns: number; sections: readonly DashboardSection[] }>
  | Readonly<{ kind: "masonry"; cards: readonly DashboardCard[] }>
  | Readonly<{ kind: "panel"; cards: readonly DashboardCard[] }>;

export type DashboardView = Readonly<{
  /** The view's `path`, else its `title`: how a room names it. */
  key: string;
  label: string;
  path: string;
  title: string;
  layout: ViewLayout;
}>;

/** The dashboards the user can read: the default one plus the extra ones (listing needs an admin). */
export const listDashboards = async (hass: Hass): Promise<readonly DashboardInfo[]> => {
  const all: DashboardInfo[] = [{ urlPath: defaultDashboardPath, title: "Overview" }];
  for (const entry of listOf(await hass.callWS({ type: "lovelace/dashboards/list" }))) {
    if (!isRecord(entry)) continue;
    const urlPath = textOf(entry.url_path);
    if (urlPath !== "") all.push({ urlPath, title: textOf(entry.title) || urlPath });
  }
  return all;
};

export const numberOf = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

/** A grid_options / getGridOptions column count: a number, or "full" for the whole section. */
export const gridColumns = (value: unknown): number | null =>
  value === "full" ? 12 : Math.min(Math.round(numberOf(value) ?? 0), 12) || null;

export const gridRows = (value: unknown): number | null => numberOf(value);

const sectionCard = (config: Record<string, unknown>): DashboardCard => {
  const options = isRecord(config.grid_options) ? config.grid_options : {};
  return { config, columns: gridColumns(options.columns), rows: gridRows(options.rows) };
};

const plainCard = (config: Record<string, unknown>): DashboardCard => ({ config, columns: null, rows: null });

const layoutOf = (view: Record<string, unknown>): ViewLayout => {
  const direct = listOf(view.cards).filter(isRecord);
  if (view.type === "sections") {
    return {
      kind: "sections",
      maxColumns: Math.min(Math.max(Math.round(numberOf(view.max_columns) ?? 4), 1), 4),
      sections: listOf(view.sections)
        .filter(isRecord)
        .map((section) => ({
          columnSpan: Math.max(Math.round(numberOf(section.column_span) ?? 1), 1),
          cards: listOf(section.cards).filter(isRecord).map(sectionCard),
        })),
    };
  }
  return { kind: view.type === "panel" ? "panel" : "masonry", cards: direct.map(plainCard) };
};

/** The tabs of a dashboard. */
export const readViews = async (hass: Hass, urlPath: string): Promise<readonly DashboardView[]> => {
  const response = await hass.callWS({
    type: "lovelace/config",
    url_path: urlPath === defaultDashboardPath ? null : urlPath,
    force: false,
  });
  if (!isRecord(response)) return [];
  return listOf(response.views)
    .filter(isRecord)
    .map((view, index) => {
      const path = textOf(view.path);
      const title = textOf(view.title);
      const key = path || title || `view-${String(index)}`;
      return { key, label: title || path || `Tab ${String(index + 1)}`, path, title, layout: layoutOf(view) };
    });
};

/**
 * The tab for a room: the one chosen for it, else the tab whose `path` (then `title`) matches the room name.
 * A chosen tab that no longer exists falls back to the name match.
 */
export const tabForArea = (
  views: readonly DashboardView[],
  chosen: string | undefined,
  areaName: string,
  haAreaName: string | null = null,
): DashboardView | null => {
  const named = (name: string): DashboardView | undefined => {
    const wanted = normalize(name);
    return (
      views.find((view) => normalize(view.path) === wanted) ??
      views.find((view) => normalize(view.title) === wanted)
    );
  };
  // The chosen tab, else the one named like the room, else like its HA area (owner 2026-11-17).
  return (
    views.find((view) => chosen !== undefined && view.key === chosen) ??
    named(areaName) ??
    (haAreaName === null ? undefined : named(haAreaName)) ??
    null
  );
};

/**
 * Whether a room has a tab to show (15.6): without one it opens full-screen, with no cards and no message. The
 * hint to choose a tab lives in Settings only.
 */
export const roomHasTab = (
  views: readonly DashboardView[],
  dashboard: HaDashboardValue,
  houseId: string | null,
  areaId: string,
  areaName: string,
  haAreaName: string | null,
): boolean => tabForArea(views, chosenTab(dashboard, houseId, areaId), areaName, haAreaName) !== null;

export const chosenTab = (
  dashboard: HaDashboardValue,
  houseId: string | null,
  areaId: string,
): string | undefined => (houseId === null ? undefined : dashboard.areaTabs[houseId]?.[areaId]);

/** A copy of a record without one key. */
export const without = <V>(record: Readonly<Record<string, V>> | undefined, key: string): Record<string, V> =>
  Object.fromEntries(Object.entries(record ?? {}).filter(([entryKey]) => entryKey !== key));

/** The dashboard switched to another one: the house's room and floor tabs belong to the old one, so they go. */
export const withDashboardPath = (
  dashboard: HaDashboardValue,
  houseId: string | null,
  urlPath: string | null,
): HaDashboardValue =>
  urlPath === dashboard.urlPath
    ? dashboard
    : {
        ...dashboard,
        urlPath,
        areaTabs: houseId === null ? dashboard.areaTabs : without(dashboard.areaTabs, houseId),
        ...(dashboard.floorTabs === undefined
          ? {}
          : { floorTabs: houseId === null ? dashboard.floorTabs : without(dashboard.floorTabs, houseId) }),
      };

/** How many section columns wide a room's panel is (one unless the room says otherwise). */
export const roomColumns = (dashboard: HaDashboardValue, houseId: string | null, areaId: string): 1 | 2 =>
  (houseId === null ? undefined : dashboard.areaColumns[houseId]?.[areaId]) ?? 1;

/** One room's panel width chosen; one column (the default) is stored as no entry. */
export const withRoomColumns = (
  dashboard: HaDashboardValue,
  houseId: string,
  areaId: string,
  columns: 1 | 2,
): HaDashboardValue => {
  const others = without(dashboard.areaColumns[houseId], areaId);
  const mine = columns === 1 ? others : { ...others, [areaId]: columns };
  return { ...dashboard, areaColumns: { ...dashboard.areaColumns, [houseId]: mine } };
};

/** Whether a room's title is shown above its cards (14.4; hidden unless the room says so). */
export const roomTitleShown = (
  dashboard: HaDashboardValue,
  houseId: string | null,
  areaId: string,
): boolean => houseId !== null && dashboard.areaTitles?.[houseId]?.[areaId] === true;

/** One room's title shown or hidden; hidden (the default) is stored as no entry. */
export const withRoomTitle = (
  dashboard: HaDashboardValue,
  houseId: string,
  areaId: string,
  shown: boolean,
): HaDashboardValue => {
  const others = without(dashboard.areaTitles?.[houseId], areaId);
  const mine: Record<string, true> = shown ? { ...others, [areaId]: true } : others;
  return { ...dashboard, areaTitles: { ...dashboard.areaTitles, [houseId]: mine } };
};

/** One room's tab chosen (or with "" matched by name again). */
export const withRoomTab = (
  dashboard: HaDashboardValue,
  houseId: string,
  areaId: string,
  tab: string,
): HaDashboardValue => {
  const others = without(dashboard.areaTabs[houseId], areaId);
  const mine = tab === "" ? others : { ...others, [areaId]: tab };
  return { ...dashboard, areaTabs: { ...dashboard.areaTabs, [houseId]: mine } };
};

// ---- Floor widgets (13.7, spec/home-assistant/viewer-mvp.md#floor-widgets) ------------------------------------

export type FloorColumns = 1 | 2 | 3 | 4;

/** Where floor widgets sit when no position is stored (implementation convention, like the room panel). */
export const defaultFloorPosition: HaFloorWidgetPositionValue = "right";

/** Most columns a position takes: left and right 2, top and bottom 4. */
export const maxFloorColumns = (position: HaFloorWidgetPositionValue): 2 | 4 =>
  position === "left" || position === "right" ? 2 : 4;

const clampColumns = (columns: number, position: HaFloorWidgetPositionValue): FloorColumns => {
  const clamped = Math.min(Math.max(Math.round(columns), 1), maxFloorColumns(position));
  return clamped === 4 ? 4 : clamped === 3 ? 3 : clamped === 2 ? 2 : 1;
};

/** The floor's widget tab, or undefined: the floor shows no widgets. */
export const floorTab = (
  dashboard: HaDashboardValue,
  houseId: string | null,
  floorId: string,
): string | undefined => (houseId === null ? undefined : dashboard.floorTabs?.[houseId]?.[floorId]);

export const floorPosition = (
  dashboard: HaDashboardValue,
  houseId: string | null,
  floorId: string,
): HaFloorWidgetPositionValue =>
  (houseId === null ? undefined : dashboard.floorPositions?.[houseId]?.[floorId]) ?? defaultFloorPosition;

/** The floor's widget columns, within what its position takes (one unless set). */
export const floorColumns = (
  dashboard: HaDashboardValue,
  houseId: string | null,
  floorId: string,
): FloorColumns =>
  clampColumns(
    (houseId === null ? undefined : dashboard.floorColumns?.[houseId]?.[floorId]) ?? 1,
    floorPosition(dashboard, houseId, floorId),
  );

/** One floor's entry of a per-house, per-floor record set (or with undefined removed). */
const withFloorEntry = <V>(
  record: Readonly<Record<string, Readonly<Record<string, V>>>> | undefined,
  houseId: string,
  floorId: string,
  value: V | undefined,
): Record<string, Record<string, V>> => {
  const others = without(record?.[houseId], floorId);
  return { ...record, [houseId]: value === undefined ? others : { ...others, [floorId]: value } };
};

/** One floor's widget tab chosen, or with "" none (no widgets). */
export const withFloorTab = (
  dashboard: HaDashboardValue,
  houseId: string,
  floorId: string,
  tab: string,
): HaDashboardValue => ({
  ...dashboard,
  floorTabs: withFloorEntry<string>(dashboard.floorTabs, houseId, floorId, tab === "" ? undefined : tab),
});

/** One floor's widget columns, clamped to its position; one column (the default) is stored as no entry. */
export const withFloorColumns = (
  dashboard: HaDashboardValue,
  houseId: string,
  floorId: string,
  columns: number,
): HaDashboardValue => {
  const clamped = clampColumns(columns, floorPosition(dashboard, houseId, floorId));
  return {
    ...dashboard,
    floorColumns: withFloorEntry<FloorColumns>(
      dashboard.floorColumns,
      houseId,
      floorId,
      clamped === 1 ? undefined : clamped,
    ),
  };
};

/** One floor's widget position; the columns are clamped to what the new position takes. */
export const withFloorPosition = (
  dashboard: HaDashboardValue,
  houseId: string,
  floorId: string,
  position: HaFloorWidgetPositionValue,
): HaDashboardValue => {
  const columns: number = dashboard.floorColumns?.[houseId]?.[floorId] ?? 1;
  const moved: HaDashboardValue = {
    ...dashboard,
    floorPositions: withFloorEntry<HaFloorWidgetPositionValue>(
      dashboard.floorPositions,
      houseId,
      floorId,
      position === defaultFloorPosition ? undefined : position,
    ),
  };
  return withFloorColumns(moved, houseId, floorId, columns);
};
