// Canonical artifact identities: JSON object keys sort; arrays retain their schema-defined order.
export const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    if (
      value === undefined ||
      typeof value === "function" ||
      typeof value === "symbol" ||
      (typeof value === "number" && !Number.isFinite(value))
    )
      throw new Error("Artifact values must be finite JSON.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
};
export const safeArtifactPath = (value: string): boolean =>
  value.length > 0 &&
  value.length <= 512 &&
  /^[a-zA-Z0-9_./-]+$/.test(value) &&
  value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
