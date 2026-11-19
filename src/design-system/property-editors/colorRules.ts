// sRGB 0–255 color values as [r, g, b] and their hex form.

export type Rgb = readonly [number, number, number];

const channel = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255 ? value : undefined;

export const readRgb = (value: unknown): Rgb | undefined => {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  const r = channel(value[0]);
  const g = channel(value[1]);
  const b = channel(value[2]);
  return r === undefined || g === undefined || b === undefined ? undefined : [r, g, b];
};

export const rgbToHex = (rgb: Rgb): string =>
  `#${rgb.map((part) => part.toString(16).padStart(2, "0")).join("")}`;

export const hexToRgb = (text: string): Rgb | undefined => {
  const match = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(text.trim());
  const digits = match?.[1];
  if (digits === undefined) return undefined;
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : digits;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
};
