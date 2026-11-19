// Local date-time without offset, stored as YYYY-MM-DDTHH:mm:ss.

export const parseLocalDateTime = (
  text: string,
): Readonly<{ ok: true; value: string }> | Readonly<{ ok: false; message: string }> => {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2})?$/.exec(text.trim());
  if (match === null) return { ok: false, message: "Enter a date and time." };
  const value = `${match[1] ?? ""}T${match[2] ?? ""}${match[3] ?? ":00"}`;
  return Number.isNaN(Date.parse(`${value}Z`))
    ? { ok: false, message: "Enter a valid date and time." }
    : { ok: true, value };
};
