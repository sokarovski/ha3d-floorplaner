/** Short JSON-ish description of a committed value for the /ds event logs. */
export const describeCommit = (value: unknown): string => {
  if (value instanceof File) return `File(${value.name}, ${String(value.size)} bytes)`;
  const text = JSON.stringify(value);
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
};
