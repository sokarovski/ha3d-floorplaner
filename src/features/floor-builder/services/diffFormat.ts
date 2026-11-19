// Readable one-line summaries of JSON diff values.
export const summarizeJson = (value: unknown): string => {
  if (value === undefined) return "—";
  const text = JSON.stringify(value);
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
};

export const formatRevisionTime = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
