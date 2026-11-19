// Display helpers for house cards.
export const formatModified = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

export const floorCountLabel = (count: number): string =>
  count === 1 ? "1 floor" : `${String(count)} floors`;
