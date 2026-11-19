// File editor checks: media type and size from the schema's x-homeplan accept/maxBytes.
import type { DropItem } from "react-aria-components";

export const describeFile = (file: File): string => `${file.name} (${formatBytes(file.size)})`;

export const formatBytes = (bytes: number): string =>
  bytes < 1024
    ? `${String(bytes)} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const matchesAccept = (file: File, accept: readonly string[]): boolean =>
  accept.length === 0 ||
  accept.some((pattern) =>
    pattern.startsWith(".")
      ? file.name.toLowerCase().endsWith(pattern.toLowerCase())
      : pattern.endsWith("/*")
        ? file.type.startsWith(pattern.slice(0, -1))
        : file.type === pattern,
  );

export const checkFile = (
  file: File,
  accept: readonly string[],
  maxBytes: number | undefined,
): string | undefined => {
  if (!matchesAccept(file, accept)) return `This file type is not supported. Use ${accept.join(", ")}.`;
  if (maxBytes !== undefined && file.size > maxBytes)
    return `The file is larger than ${formatBytes(maxBytes)}.`;
  return undefined;
};

export const firstDroppedFile = async (items: readonly DropItem[]): Promise<File | undefined> => {
  for (const item of items) {
    if (item.kind === "file") return item.getFile();
  }
  return undefined;
};
