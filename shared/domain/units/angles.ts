// Angle input: degrees with an optional "°" or "deg" suffix; normalized into [0, 360) unless the schema bounds it.

export type AngleParseResult =
  Readonly<{ ok: true; degrees: number }> | Readonly<{ ok: false; message: string }>;

const anglePattern = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(°|deg|degrees?)?$/;

export const parseAngle = (text: string): AngleParseResult => {
  const match = anglePattern.exec(text.trim().toLowerCase());
  if (match === null) return { ok: false, message: "Enter an angle in degrees, e.g. 90 or 45°." };
  const degrees = Number(match[1]);
  return Number.isFinite(degrees) ? { ok: true, degrees } : { ok: false, message: "Enter a finite angle." };
};

export const normalizeDegrees = (degrees: number): number => {
  const wrapped = degrees % 360;
  const positive = wrapped < 0 ? wrapped + 360 : wrapped;
  return Math.abs(positive - 360) < 1e-9 ? 0 : positive;
};

export const formatDegrees = (degrees: number): string => {
  const fixed = degrees.toFixed(2);
  return fixed.replace(/0+$/, "").replace(/\.$/, "");
};
