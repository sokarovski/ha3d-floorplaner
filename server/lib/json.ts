// Narrowing helpers for untyped JSON and Node errors.

export type JsonRecord = Record<string, unknown>;

export const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Parses JSON text; returns undefined instead of throwing. */
export const parseJson = (text: string): { ok: true; value: unknown } | { ok: false; message: string } => {
  try {
    const value: unknown = JSON.parse(text);
    return { ok: true, value };
  } catch (error: unknown) {
    return { ok: false, message: error instanceof Error ? error.message : "Invalid JSON" };
  }
};

/** Stable, Git-friendly JSON text for files on disk. */
export const toJsonText = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

export const isErrnoCode = (error: unknown, code: string): boolean =>
  error instanceof Error && "code" in error && error.code === code;

/** Encodes one JSON Pointer reference token (RFC 6901). */
export const pointerToken = (token: string | number): string =>
  String(token).replaceAll("~", "~0").replaceAll("/", "~1");

/** Trims and NFC-normalizes a display name. */
export const normalizeName = (value: string): string => value.normalize("NFC").trim();
