// Plain number input for the number editor (lumens, counts). "." is the decimal separator (D16).

export type NumberParseResult =
  Readonly<{ ok: true; value: number }> | Readonly<{ ok: false; message: string }>;

export const parsePlainNumber = (text: string, integer: boolean): NumberParseResult => {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, message: "Enter a number." };
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) return { ok: false, message: "Enter a number." };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { ok: false, message: "Enter a finite number." };
  if (integer && !Number.isInteger(value)) return { ok: false, message: "Enter a whole number." };
  return { ok: true, value };
};

export const formatPlainNumber = (value: number, maximumDecimals = 4): string => {
  const fixed = value.toFixed(maximumDecimals);
  return fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
};
