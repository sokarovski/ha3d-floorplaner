// Width of the room cards / floor widgets for a number of section columns (pure; viewLayout.ts draws them).
export const columnPx = 340;
export const sectionGapPx = 16;

export const cardsWidthPx = (columns: number): number => columns * columnPx + (columns - 1) * sectionGapPx;
