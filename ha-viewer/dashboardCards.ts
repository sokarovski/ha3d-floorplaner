// Home Assistant's own cards for a dashboard tab (shared by the room panel and the floor widgets, 13.7): HA's card
// factory, and each card created and sized as HA's sections view sizes it.
import { gridColumns, gridRows, isRecord } from "./dashboardViews";
import type { DashboardCard } from "./dashboardViews";
import type { ResolvedCard } from "./viewLayout";

export type CardHelpers = Readonly<{ create: (config: Record<string, unknown>) => unknown }>;

/** HA's card factory (public window.loadCardHelpers). */
export const loadHelpers = async (): Promise<CardHelpers> => {
  const loader: unknown = Reflect.get(window, "loadCardHelpers");
  if (typeof loader !== "function") throw new Error("Home Assistant card helpers are not available here.");
  const helpers: unknown = await Reflect.apply(loader, window, []);
  const create: unknown = isRecord(helpers) ? helpers.createCardElement : undefined;
  if (typeof create !== "function") throw new Error("Home Assistant card helpers are not available here.");
  return {
    create: (config) => {
      const card: unknown = Reflect.apply(create, helpers, [config]);
      return card;
    },
  };
};

const timeoutAfter = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

/**
 * Creates a card and sizes it: the size set in the dashboard, else the card's own default from its
 * `getGridOptions()` (what HA's sections view does), else the full section width. Cards load lazily, so the
 * element is waited for until it is defined.
 */
export const resolveCard = async (
  helpers: CardHelpers,
  card: DashboardCard,
): Promise<ResolvedCard | null> => {
  const node = helpers.create(card.config);
  if (!(node instanceof HTMLElement)) return null;
  if (node.localName.includes("-"))
    await Promise.race([customElements.whenDefined(node.localName), timeoutAfter(3000)]);
  const getOptions: unknown = Reflect.get(node, "getGridOptions");
  const defaults: unknown = typeof getOptions === "function" ? Reflect.apply(getOptions, node, []) : null;
  const fromCard = isRecord(defaults) ? defaults : {};
  return {
    node,
    columns: card.columns ?? gridColumns(fromCard.columns) ?? 12,
    rows: card.rows ?? gridRows(fromCard.rows),
  };
};
