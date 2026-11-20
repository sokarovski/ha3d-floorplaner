// The material chooser's library (owner, 2026-11-20; spec/builder/features/materials-and-objects.md#material-chooser):
// every material a surface can take, in groups. **Used in this house** lists the distinct materials the house's
// surfaces carry now (saved as a preset or not), **House presets** the house's saved presets, then the built-in
// presets in a fixed list of categories (they are read-only and ship with the app). Pure: no React or stores.
import { builtInPresets } from "../house/defaults";
import type { HouseDocument } from "../schemas/house";
import { SurfaceMaterialSchema } from "../schemas/values";
import type { SurfaceMaterialValue } from "../schemas/values";
import { compileValidator } from "../validation/ajv";
import { canonicalJson } from "../validation/artifact";

export const usedCategory = "Used in this house";
export const housePresetsCategory = "House presets";

/** The built-in presets' categories, in the chooser's order (a fixed list, owner 2026-11-20). */
export const builtInCategories = [
  "Paint and plain",
  "Wood",
  "Tiles and stone",
  "Outdoor",
  "Roofing",
] as const;
export type BuiltInCategory = (typeof builtInCategories)[number];

const builtInCategoryById: Readonly<Record<string, BuiltInCategory>> = {
  builtin_capwhite: "Paint and plain",
  builtin_wallpaint: "Paint and plain",
  builtin_flooring: "Paint and plain",
  builtin_concrete: "Paint and plain",
  builtin_darkwood: "Wood",
  builtin_oakparquet: "Wood",
  builtin_walnut: "Wood",
  builtin_ashplanks: "Wood",
  builtin_greytiles: "Tiles and stone",
  builtin_whitetiles: "Tiles and stone",
  builtin_terracotta: "Tiles and stone",
  builtin_slatetiles: "Tiles and stone",
  builtin_granite: "Tiles and stone",
  builtin_decking: "Outdoor",
  builtin_lawngrass: "Outdoor",
  builtin_paving: "Outdoor",
  builtin_aluminium: "Roofing",
};

/** A built-in preset's category; one added without a category falls under Paint and plain. */
export const builtInCategory = (presetId: string): BuiltInCategory =>
  builtInCategoryById[presetId] ?? "Paint and plain";

/** Every category the chooser shows, in order. */
export const libraryCategories: readonly string[] = [
  usedCategory,
  housePresetsCategory,
  ...builtInCategories,
];

/** One tile of the chooser. */
export type LibraryMaterial = Readonly<{
  /** `preset:<id>`, or `used:<material>` (stable while the material stays the same, also after it is saved). */
  key: string;
  name: string;
  category: string;
  material: SurfaceMaterialValue;
  source: "builtin" | "house" | "used";
  /** The preset's ID (built-in or house), when it is one. */
  presetId?: string;
  /** How many surfaces of the house use this material (Used in this house). */
  surfaces?: number;
}>;

export type PresetEntry = Readonly<{
  id: string;
  name: string;
  material: SurfaceMaterialValue;
  builtIn: boolean;
}>;

/** Two materials are the same when their values are (key order ignored). */
export const materialKey = (material: SurfaceMaterialValue): string => canonicalJson(material);

const isMaterial = compileValidator(SurfaceMaterialSchema);

/**
 * The distinct materials the house's surfaces use, most used first, with how many surfaces use each. Every surface
 * material of the document counts (walls, rooms, carpets, slabs, roofs, objects' own colours), the presets list
 * itself does not.
 */
export const usedMaterials = (
  house: HouseDocument,
): readonly Readonly<{ material: SurfaceMaterialValue; surfaces: number }>[] => {
  const found = new Map<string, { material: SurfaceMaterialValue; surfaces: number }>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    if (isMaterial(value)) {
      const key = materialKey(value);
      const entry = found.get(key);
      if (entry === undefined) found.set(key, { material: value, surfaces: 1 });
      else entry.surfaces += 1;
      return;
    }
    for (const item of Object.values(value)) visit(item);
  };
  for (const [key, value] of Object.entries(house)) if (key !== "materialPresets") visit(value);
  return [...found.values()].sort((a, b) => b.surfaces - a.surfaces);
};

/** The colour of a material as #rrggbb (its base colour; a texture is tinted by it). */
export const materialHex = (material: SurfaceMaterialValue): string =>
  `#${material.pbrMetallicRoughness.baseColorFactor
    .slice(0, 3)
    .map((channel) =>
      Math.round(Math.min(1, Math.max(0, channel)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

/**
 * The chooser's library: Used in this house (named after the preset it matches, else "Custom"), House presets,
 * then the built-ins by category.
 */
export const materialLibrary = (
  house: HouseDocument,
  presets: readonly PresetEntry[],
): readonly LibraryMaterial[] => {
  const byKey = new Map(presets.map((preset) => [materialKey(preset.material), preset]));
  let custom = 0;
  const used = usedMaterials(house).map((entry): LibraryMaterial => {
    const preset = byKey.get(materialKey(entry.material));
    if (preset === undefined) custom += 1;
    return {
      key: `used:${materialKey(entry.material)}`,
      name: preset?.name ?? (custom === 1 ? "Custom" : `Custom ${String(custom)}`),
      category: usedCategory,
      material: entry.material,
      source: "used",
      ...(preset === undefined ? {} : { presetId: preset.id }),
      surfaces: entry.surfaces,
    };
  });
  const saved = presets
    .filter((preset) => !preset.builtIn)
    .map((preset): LibraryMaterial => ({
      key: `preset:${preset.id}`,
      name: preset.name,
      category: housePresetsCategory,
      material: preset.material,
      source: "house",
      presetId: preset.id,
    }));
  const builtIn = builtInCategories.flatMap((category) =>
    presets
      .filter((preset) => preset.builtIn && builtInCategory(preset.id) === category)
      .map((preset): LibraryMaterial => ({
        key: `preset:${preset.id}`,
        name: preset.name,
        category,
        material: preset.material,
        source: "builtin",
        presetId: preset.id,
      })),
  );
  return [...used, ...saved, ...builtIn];
};

/** Built-in presets as library entries, for hosts without a house (the design-system pages). */
export const builtInPresetEntries: readonly PresetEntry[] = builtInPresets.map((preset) => ({
  ...preset,
  builtIn: true,
}));

/**
 * The chooser's search: every word of the query must appear in the name, the category, or "textured"/"plain"
 * (case-insensitive); the category filter keeps one category (null = all).
 */
export const searchLibrary = (
  library: readonly LibraryMaterial[],
  query: string,
  category: string | null,
): readonly LibraryMaterial[] => {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  return library.filter((item) => {
    if (category !== null && item.category !== category) return false;
    const kind = item.material.pbrMetallicRoughness.baseColorTexture === undefined ? "plain" : "textured";
    const text = `${item.name} ${item.category} ${kind}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
};
