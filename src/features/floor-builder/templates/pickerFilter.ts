// Which templates each picker offers.
import type { TemplateListItemValue } from "@shared/contracts/templates";
import { floorOpeningKind, roofWindowKind } from "@shared/domain/templates/metadata";
import { fenceKind, gateKind } from "@shared/domain/house/yards";
import type { PickerRequest } from "./templatePickerStore";

export const pickerTemplates = (
  templates: readonly TemplateListItemValue[],
  request: PickerRequest,
): readonly TemplateListItemValue[] => {
  if (request.kind === "opening")
    return templates.filter(
      (item) =>
        item.contract === "Wallable" &&
        (request.filter === "door"
          ? item.kind === "door"
          : request.filter === "gate"
            ? item.kind === gateKind
            : item.kind !== "door" && item.kind !== gateKind && item.kind !== roofWindowKind),
    );
  // Roof windows (19.3) are placed on a roof face only.
  if (request.kind === "roofWindow")
    return templates.filter((item) => item.contract === "Wallable" && item.kind === roofWindowKind);
  if (request.kind === "staircase") return templates.filter((item) => item.contract === "Staircasable");
  if (request.kind === "floorOpening")
    return templates.filter((item) => item.contract === "Areable" && item.kind === floorOpeningKind);
  if (request.kind === "fixture") return templates.filter((item) => item.kind === "light");
  // Fence segments (Phase 17.2) are drawn along a yard's walls, never placed.
  return templates.filter(
    (item) => item.contract === "Areable" && item.kind !== floorOpeningKind && item.kind !== fenceKind,
  );
};

export type PickerSource = "all" | "builtin" | "house";

/** The picker category of a template: the one its metadata declares, else "Other" (Phase 9.1). */
export const otherCategory = "Other";
export const templateCategory = (item: TemplateListItemValue): string => item.category ?? otherCategory;

/** "All" in the category filter. */
export const allCategories = null;

export type CategoryCount = Readonly<{ category: string; count: number }>;

/**
 * The categories the listed templates declare, with how many templates each has (Phase 9.1): alphabetical, with
 * "Other" (no category) last. No category list is built into the app.
 */
export const pickerCategories = (templates: readonly TemplateListItemValue[]): readonly CategoryCount[] => {
  const counts = new Map<string, number>();
  for (const item of templates)
    counts.set(templateCategory(item), (counts.get(templateCategory(item)) ?? 0) + 1);
  return [...counts]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) =>
      a.category === otherCategory
        ? 1
        : b.category === otherCategory
          ? -1
          : a.category.localeCompare(b.category),
    );
};

/** Everything a search word may match: label, kind, category, tags, and product fields. */
const searchText = (item: TemplateListItemValue): string =>
  [
    item.label,
    item.kind,
    item.category ?? "",
    ...(item.tags ?? []),
    item.product?.manufacturer ?? "",
    item.product?.name ?? "",
    item.product?.code ?? "",
    item.product?.description ?? "",
  ]
    .join(" ")
    .toLowerCase();

/**
 * The object picker's search (Phase 7.8, 9.1): every word of the query must appear in the template's label,
 * kind, category, tags, or product manufacturer, name, code, or description (case-insensitive); the source
 * filter keeps built-in or house templates and the category filter one category (null = all).
 */
export const searchTemplates = (
  templates: readonly TemplateListItemValue[],
  query: string,
  source: PickerSource,
  category: string | null = allCategories,
): readonly TemplateListItemValue[] => {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  return templates.filter((item) => {
    if (source !== "all" && item.source !== source) return false;
    if (category !== null && templateCategory(item) !== category) return false;
    const text = searchText(item);
    return words.every((word) => text.includes(word));
  });
};

export const pickerTitle = (request: PickerRequest): string =>
  request.kind === "opening"
    ? request.filter === "door"
      ? "Add a door"
      : request.filter === "gate"
        ? "Add a gate"
        : "Add a window"
    : request.kind === "staircase"
      ? "Add a staircase"
      : request.kind === "floorOpening"
        ? "Add a floor opening"
        : request.kind === "fixture"
          ? "Choose a light fixture"
          : request.kind === "roofWindow"
            ? "Add a roof window"
            : "Add an object";
