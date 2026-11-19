// Resolves a house-local date-time in an IANA time zone to a UTC instant, independent of the host's zone.
// DST gaps (non-existent local times) are reported; ambiguous times (fall-back) use the earlier offset.

const offsetMinutes = (instantMs: number, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instantMs));
  const field = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    field("year"),
    field("month") - 1,
    field("day"),
    field("hour"),
    field("minute"),
    field("second"),
  );
  return Math.round((asUtc - instantMs) / 60000);
};

export type ResolvedInstant =
  Readonly<{ ok: true; utc: Date; offsetMinutes: number }> | Readonly<{ ok: false; message: string }>;

export const isValidTimeZone = (timeZone: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
};

export const resolveLocalDateTime = (localDateTime: string, timeZone: string): ResolvedInstant => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(localDateTime);
  if (match === null) return { ok: false, message: "The date and time are not valid." };
  if (!isValidTimeZone(timeZone)) return { ok: false, message: `Unknown time zone ${timeZone}.` };
  const [, y, mo, d, h, mi, s] = match;
  const naiveUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? "0"));
  const candidates = new Set([
    offsetMinutes(naiveUtc - 36e5 * 12, timeZone),
    offsetMinutes(naiveUtc, timeZone),
    offsetMinutes(naiveUtc + 36e5 * 12, timeZone),
  ]);
  const matches = [...candidates]
    .map((offset) => naiveUtc - offset * 60000)
    .filter((instant) => offsetMinutes(instant, timeZone) * 60000 === naiveUtc - instant)
    .sort((a, b) => a - b);
  const first = matches[0];
  if (first === undefined)
    return {
      ok: false,
      message: "This local time does not exist (daylight-saving change). Choose another time.",
    };
  return { ok: true, utc: new Date(first), offsetMinutes: offsetMinutes(first, timeZone) };
};

/** The current instant formatted as a local date-time in the zone (for display in current-time mode). */
export const localDateTimeOf = (instant: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const field = (type: string): string => parts.find((part) => part.type === type)?.value ?? "00";
  return `${field("year")}-${field("month")}-${field("day")}T${field("hour")}:${field("minute")}:${field("second")}`;
};
