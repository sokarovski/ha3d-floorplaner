// Draws a dashboard tab's layout from its card elements the way HA does (sections grid, masonry columns, or a
// single panel card). Pure DOM: the card elements come from HA's card factory.
import { cardsWidthPx, sectionGapPx } from "./cardsWidth";
import type { DashboardCard, ViewLayout } from "./dashboardViews";
export { cardsWidthPx };

/** Width of one section column and the gap and padding around it (implementation conventions). */
const bodyPaddingPx = 12;
const rowPx = 56;
const gapPx = 8;

/** A created card element with its size on the section grid, already resolved against the card's defaults. */
export type ResolvedCard = Readonly<{ node: HTMLElement; columns: number; rows: number | null }>;

/** The width of a number of section columns side by side, without any padding (the floor widgets, 13.7). */

/** The panel's width for a number of section columns, including its own padding. */
export const panelWidthPx = (columns: number): number => cardsWidthPx(columns) + 2 * bodyPaddingPx;

export type BuiltLayout = Readonly<{
  root: HTMLElement;
  cards: readonly HTMLElement[];
  /** Lays the sections out in this many columns (the panel's width setting). */
  fit: (columns: number) => void;
}>;

const element = (css: Partial<CSSStyleDeclaration>): HTMLElement => {
  const node = document.createElement("div");
  Object.assign(node.style, css);
  return node;
};

export const buildLayout = async (
  layout: ViewLayout,
  create: (card: DashboardCard) => Promise<ResolvedCard | null>,
): Promise<BuiltLayout> => {
  const cards: HTMLElement[] = [];
  // Every card is created at once (they load lazily) and kept in order.
  const resolved = new Map<DashboardCard, ResolvedCard>();
  const all = layout.kind === "sections" ? layout.sections.flatMap((section) => section.cards) : layout.cards;
  await Promise.all(
    all.map(async (card) => {
      const made = await create(card);
      if (made !== null) resolved.set(card, made);
    }),
  );
  const make = (card: DashboardCard): ResolvedCard | null => {
    const made = resolved.get(card) ?? null;
    if (made !== null) cards.push(made.node);
    return made;
  };

  if (layout.kind === "sections") {
    const root = element({ display: "grid", gap: `${String(sectionGapPx)}px`, alignItems: "start" });
    const sections = layout.sections.map((section) => {
      const node = element({
        display: "grid",
        gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
        gridAutoRows: "min-content",
        gap: `${String(gapPx)}px`,
      });
      for (const card of section.cards) {
        const built = make(card);
        if (built === null) continue;
        const cell = element({ gridColumn: `span ${String(built.columns)}`, minWidth: "0" });
        if (built.rows !== null)
          cell.style.minHeight = `${String(built.rows * rowPx + (built.rows - 1) * gapPx)}px`;
        cell.append(built.node);
        node.append(cell);
      }
      root.append(node);
      return { node, columnSpan: section.columnSpan };
    });
    return {
      root,
      cards,
      fit: (available) => {
        const columns = Math.min(available, layout.maxColumns);
        root.style.gridTemplateColumns = `repeat(${String(columns)}, minmax(0, 1fr))`;
        for (const { node, columnSpan } of sections)
          node.style.gridColumn = `span ${String(Math.min(columnSpan, columns))}`;
      },
    };
  }

  if (layout.kind === "panel") {
    const root = element({ display: "block" });
    const first = layout.cards[0];
    const built = first === undefined ? null : make(first);
    if (built !== null) root.append(built.node);
    return { root, cards, fit: () => undefined };
  }

  const root = element({ columnGap: `${String(sectionGapPx)}px` });
  for (const card of layout.cards) {
    const built = make(card);
    if (built === null) continue;
    const cell = element({ breakInside: "avoid", marginBottom: `${String(gapPx)}px` });
    cell.append(built.node);
    root.append(cell);
  }
  return {
    root,
    cards,
    fit: (columns) => {
      root.style.columnCount = String(columns);
    },
  };
};
