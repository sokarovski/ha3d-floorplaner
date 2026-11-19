// The part of the screen an open room's cards cover (14.4), and none at all for a room without a tab (15.6).
import type { FrameInsets } from "./three/frameInsets";
import { cardsWidthPx } from "./cardsWidth";

/** Under this width the room panel is a bottom sheet and the floor widgets go below the house (owner). */
export const compactWidthPx = 700;

/** Space kept around the cards and floor widgets: the screen margin and a gap to the house (px). */
export const widgetMarginPx = 12;
export const widgetGapPx = 8;

/** On a narrow screen the room cards are a bottom sheet from this share of the height down (14.4). */
export const sheetTop = 0.4;

const none: FrameInsets = { left: 0, right: 0, top: 0, bottom: 0 };

/**
 * The frame insets of an open room: on a wide screen the cards' column width beside the house plus the screen
 * margin and a gap (at most 70 %), under 700 px the bottom sheet. A room without cards (15.6) has none: it is
 * framed in the real centre of the whole screen.
 */
export const roomFrameInsets = (width: number, hasCards: boolean, columns: number): FrameInsets => {
  if (width === 0 || !hasCards) return none;
  if (width <= compactWidthPx) return { ...none, bottom: 1 - sheetTop };
  return { ...none, right: Math.min((cardsWidthPx(columns) + widgetMarginPx + widgetGapPx) / width, 0.7) };
};
