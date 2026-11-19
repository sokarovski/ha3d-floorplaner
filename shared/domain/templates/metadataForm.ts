// Editable form views of template metadata for the Object Editor (D18: authored through SchemaForm). The views
// flatten optional parts into toggles and plain fields; conversions are lossless for everything the form shows.
// Phase 9.1 adds the picker fields (category, tags), product information, the mirror slot, per-slot material
// choices and named formulas (both keyed by the template's own names, so the panel schema is built per draft by
// `metadataFormSchema`), and the parametric node rules (visible, rotate, translate, size, face).
import Type from "typebox";
import type { Static } from "typebox";
import { hp } from "../schemas/annotations";
import type { SchemaNode } from "../schemas/schemaWalk";
import { Choice, Length } from "../schemas/values";
import type { ValidationIssue } from "../validation/ajv";
import { materialSlotMaterial, templateMaterialSlots } from "./metadata";
import type {
  AxisResize,
  MaterialSlot,
  NodeRule,
  PivotAxis,
  RepeatCount,
  TemplateMetadata,
  TemplateProduct,
} from "./metadata";

const lengthField = (title: string, order: number, group?: string) =>
  Type.Optional(Length({ title, minimum: 0, order, ...(group === undefined ? {} : { group }) }));

const axisView = (title: string, order: number) =>
  Type.Object(
    {
      mode: Choice(
        [
          ["fixed", "Fixed"],
          ["scale", "Scale"],
          ["slice", "Slice (keep end bands)"],
          ["fitHostDepth", "Fit host depth"],
        ],
        { title: "Mode", order: 1 },
      ),
      title: Type.Optional(
        Type.String({
          title: "Parameter title",
          maxLength: 60,
          ...hp({ editor: "text", order: 2, visibleWhen: { property: "sized", equals: true } }),
        }),
      ),
      sized: Type.Boolean({ title: "Instances choose the size", ...hp({ editor: "toggle", order: 2 }) }),
      minMm: lengthField("Minimum", 3),
      maxMm: lengthField("Maximum", 4),
      defaultMm: lengthField("Default", 5),
      startMm: lengthField("Start band", 6),
      endMm: lengthField("End band", 7),
      wallPosition: Type.Optional(
        Choice(
          [
            ["center", "Center of the wall"],
            ["interior", "Interior face"],
            ["exterior", "Exterior face"],
          ],
          { title: "Position in the wall", order: 8 },
        ),
      ),
      wallOffsetMm: Type.Optional(Length({ title: "Wall offset", order: 9 })),
    },
    { additionalProperties: false, title, ...hp({ group: "resize", order }) },
  );

/** How one material slot is offered on placed objects (Phase 9.1). */
export const SlotChoiceView = Type.Object(
  {
    title: Type.Optional(
      Type.String({ title: "Panel label", maxLength: 60, ...hp({ editor: "text", order: 1 }) }),
    ),
    choosable: Type.Boolean({ title: "Offered for choice", ...hp({ editor: "toggle", order: 2 }) }),
    presets: Type.Array(Type.String(), {
      title: "Presets (bundled materials)",
      uniqueItems: true,
      ...hp({ editor: "multiSelect", order: 3, visibleWhen: { property: "choosable", equals: true } }),
    }),
    allowColor: Type.Boolean({
      title: "Allow an own colour",
      ...hp({ editor: "toggle", order: 4, visibleWhen: { property: "choosable", equals: true } }),
    }),
    allowTexture: Type.Boolean({
      title: "Allow an own texture",
      ...hp({ editor: "toggle", order: 5, visibleWhen: { property: "choosable", equals: true } }),
    }),
  },
  { additionalProperties: false },
);
export type SlotChoiceViewValue = Static<typeof SlotChoiceView>;

const textField = (title: string, group: string, order: number, maxLength = 120) =>
  Type.Optional(Type.String({ title, maxLength, ...hp({ editor: "text", group, order }) }));

export const MetadataFormView = Type.Object(
  {
    label: Type.String({
      title: "Label",
      minLength: 1,
      maxLength: 120,
      ...hp({ editor: "text", group: "general", order: 1 }),
    }),
    kind: Type.String({
      title: "Kind",
      minLength: 1,
      maxLength: 64,
      ...hp({ editor: "text", group: "general", order: 2 }),
    }),
    contract: Choice(
      [
        ["Areable", "Object (Areable)"],
        ["Wallable", "Door or window (Wallable)"],
        ["Staircasable", "Staircase (Staircasable)"],
      ],
      { title: "Contract", group: "general", order: 3 },
    ),
    screenSlot: Type.Optional(
      Type.String({
        title: "Screen material (TVs: slot or material name; empty = none)",
        maxLength: 64,
        ...hp({ editor: "text", group: "general", order: 4 }),
      }),
    ),
    mirrorSlot: Type.Optional(
      Type.String({
        title: "Mirror material (slot or material name; empty = none)",
        maxLength: 64,
        ...hp({ editor: "text", group: "general", order: 5 }),
      }),
    ),
    category: textField("Category (picker group, e.g. Seating)", "picker", 1, 60),
    tags: textField("Tags (comma-separated)", "picker", 2, 1300),
    productManufacturer: textField("Manufacturer", "product", 1),
    productName: textField("Product name", "product", 2),
    productCode: textField("Product code", "product", 3),
    productUrl: textField("Link", "product", 4, 2000),
    productDescription: textField("Description", "product", 5, 2000),
    productNotes: textField("Notes", "product", 6, 2000),
    slots: Type.Record(Type.String(), SlotChoiceView, {
      title: "Material choices",
      ...hp({ group: "picker", order: 10 }),
    }),
    formulas: Type.Record(Type.String(), Type.String({ maxLength: 500 }), {
      title: "Formulas",
      ...hp({ group: "picker", order: 20 }),
    }),
    hosts: Type.Array(
      Choice([
        ["floor", "Floor"],
        ["wall", "Wall"],
        ["overhead", "Overhead"],
        ["staircaseArea", "Staircase area (legacy: the floor)"],
        ["roof", "Roof (roof windows)"],
      ]),
      {
        title: "Hosts",
        minItems: 1,
        uniqueItems: true,
        ...hp({ editor: "multiSelect", group: "attachment", order: 1 }),
      },
    ),
    contact: Type.String({
      title: "Contact",
      minLength: 1,
      ...hp({ editor: "nodeRef", group: "attachment", order: 2 }),
    }),
    defaultHostSide: Choice(
      [
        ["interior", "Interior"],
        ["exterior", "Exterior"],
      ],
      { title: "Default wall side", group: "attachment", order: 3 },
    ),
    bottomMm: lengthField("Default bottom", 4, "attachment"),
    elevationMm: lengthField("Default elevation", 5, "attachment"),
    topInsetMm: lengthField("Default top inset", 6, "attachment"),
    x: axisView("Width (X)", 1),
    y: axisView("Height (Y)", 2),
    z: axisView("Depth (Z)", 3),
    flipX: Type.Boolean({
      title: "Allow mirroring left/right",
      ...hp({ editor: "toggle", group: "flip", order: 1 }),
    }),
    flipZ: Type.Boolean({
      title: "Allow mirroring front/back",
      ...hp({ editor: "toggle", group: "flip", order: 2 }),
    }),
    hasOpening: Type.Boolean({
      title: "Cuts an opening",
      ...hp({ editor: "toggle", group: "opening", order: 1 }),
    }),
    clearanceMm: lengthField("Opening clearance", 2, "opening"),
  },
  {
    additionalProperties: false,
    ...hp({
      groups: [
        { id: "general", title: "General" },
        { id: "picker", title: "Picker" },
        { id: "product", title: "Product" },
        { id: "attachment", title: "Attachment" },
        { id: "resize", title: "Resizing" },
        { id: "flip", title: "Flips" },
        { id: "opening", title: "Opening" },
      ],
    }),
  },
);

export type MetadataFormViewValue = Static<typeof MetadataFormView>;
type AxisView = MetadataFormViewValue["x"];

const axisToView = (axis: AxisResize): AxisView => ({
  mode: axis.mode,
  sized: axis.parameter !== null && (axis.mode === "slice" || axis.mode === "scale"),
  ...(axis.title === undefined ? {} : { title: axis.title }),
  ...(axis.minMm === undefined ? {} : { minMm: axis.minMm }),
  ...(axis.maxMm === undefined ? {} : { maxMm: axis.maxMm }),
  ...(axis.defaultMm === undefined ? {} : { defaultMm: axis.defaultMm }),
  ...(axis.startMm === undefined ? {} : { startMm: axis.startMm }),
  ...(axis.endMm === undefined ? {} : { endMm: axis.endMm }),
  ...(axis.wallPosition === undefined ? {} : { wallPosition: axis.wallPosition }),
  ...(axis.wallOffsetMm === undefined ? {} : { wallOffsetMm: axis.wallOffsetMm }),
});

const viewToAxis = (view: AxisView, previous: AxisResize): AxisResize => ({
  ...previous,
  mode: view.mode,
  parameter: view.sized ? (previous.parameter ?? undefined) : null,
  title: view.title,
  minMm: view.minMm,
  maxMm: view.maxMm,
  defaultMm: view.defaultMm,
  startMm: view.startMm,
  endMm: view.endMm,
  wallPosition: view.wallPosition,
  wallOffsetMm: view.wallOffsetMm,
});

export const toMetadataView = (metadata: TemplateMetadata): MetadataFormViewValue => {
  const placement = metadata.attachment.defaultPlacement;
  return {
    label: metadata.label,
    kind: metadata.kind,
    contract: metadata.contract,
    ...(metadata.screen === undefined ? {} : { screenSlot: metadata.screen.materialSlot }),
    ...(metadata.mirror === undefined ? {} : { mirrorSlot: metadata.mirror.materialSlot }),
    ...(metadata.category === undefined ? {} : { category: metadata.category }),
    ...(metadata.tags === undefined ? {} : { tags: metadata.tags.join(", ") }),
    ...productToView(metadata.product),
    slots: Object.fromEntries(
      Object.entries(metadata.materialSlots).map(([slot, value]) => [slot, slotToView(value)]),
    ),
    formulas: { ...metadata.formulas },
    hosts: [...metadata.attachment.hosts],
    contact: metadata.attachment.contact,
    defaultHostSide: metadata.attachment.defaultHostSide ?? "interior",
    ...(placement?.bottomMm === undefined ? {} : { bottomMm: placement.bottomMm }),
    ...(placement?.elevationMm === undefined ? {} : { elevationMm: placement.elevationMm }),
    ...(placement?.topInsetMm === undefined ? {} : { topInsetMm: placement.topInsetMm }),
    x: axisToView(metadata.resize.x),
    y: axisToView(metadata.resize.y),
    z: axisToView(metadata.resize.z),
    flipX: metadata.flip.x,
    flipZ: metadata.flip.z,
    hasOpening: metadata.opening !== null,
    ...(metadata.opening === null ? {} : { clearanceMm: metadata.opening.clearanceMm }),
  };
};

type ViewOwned = "screen" | "mirror" | "category" | "tags" | "product" | "formulas";

/** The metadata without the optional fields the form owns (each is set again from the view). */
const withoutViewOwned = (metadata: TemplateMetadata): Omit<TemplateMetadata, ViewOwned> => {
  const {
    screen: _screen,
    mirror: _mirror,
    category: _category,
    tags: _tags,
    product: _product,
    formulas: _formulas,
    ...rest
  } = metadata;
  return rest;
};

const productKeys = [
  ["manufacturer", "productManufacturer"],
  ["name", "productName"],
  ["code", "productCode"],
  ["url", "productUrl"],
  ["description", "productDescription"],
  ["notes", "productNotes"],
] as const;

type ProductView = Partial<Record<(typeof productKeys)[number][1], string>>;

const productToView = (product: TemplateProduct | undefined): ProductView => {
  const view: ProductView = {};
  for (const [key, field] of productKeys) {
    const value = product?.[key];
    if (value !== undefined) view[field] = value;
  }
  return view;
};

const productFromView = (view: ProductView): TemplateProduct | undefined => {
  const product: { -readonly [K in keyof TemplateProduct]: string } = {};
  for (const [key, field] of productKeys) {
    const value = view[field]?.trim();
    if (value !== undefined && value !== "") product[key] = value;
  }
  return Object.keys(product).length === 0 ? undefined : product;
};

const slotToView = (slot: MaterialSlot): SlotChoiceViewValue =>
  typeof slot === "string"
    ? { choosable: false, presets: [], allowColor: false, allowTexture: false }
    : {
        ...(slot.title === undefined ? {} : { title: slot.title }),
        choosable: slot.choosable === true,
        presets: [...(slot.presets ?? [])],
        allowColor: slot.allowColor === true,
        allowTexture: slot.allowTexture === true,
      };

/** The slot back in metadata form: the plain string when it offers nothing, else the object form. */
const slotFromView = (view: SlotChoiceViewValue | undefined, previous: MaterialSlot): MaterialSlot => {
  const material = materialSlotMaterial(previous);
  if (view === undefined) return previous;
  const title = view.title?.trim();
  const offers = view.choosable || (title !== undefined && title !== "");
  if (!offers) return material;
  return {
    material,
    ...(title === undefined || title === "" ? {} : { title }),
    ...(view.choosable ? { choosable: true } : {}),
    ...(view.choosable && view.presets.length > 0 ? { presets: [...view.presets] } : {}),
    ...(view.choosable && view.allowColor ? { allowColor: true } : {}),
    ...(view.choosable && view.allowTexture ? { allowTexture: true } : {}),
  };
};

const tagsFromText = (text: string | undefined): string[] => [
  ...new Set(
    (text ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag !== ""),
  ),
];

/** The typed screen: a slot name, or a glTF material name that a slot maps to (slot names are not shown). */
const screenSlotOf = (typed: string, slots: Readonly<Record<string, string>>): string => {
  if (Object.hasOwn(slots, typed)) return typed;
  const bySlotMaterial = Object.entries(slots).find(([, material]) => material === typed);
  return bySlotMaterial?.[0] ?? typed;
};

export const fromMetadataView = (
  view: MetadataFormViewValue,
  previous: TemplateMetadata,
): TemplateMetadata => {
  const category = view.category?.trim();
  const tags = tagsFromText(view.tags);
  const product = productFromView(view);
  const formulas = Object.fromEntries(
    Object.keys(previous.formulas ?? {}).flatMap((name) => {
      const text = (view.formulas[name] ?? previous.formulas?.[name] ?? "").trim();
      return text === "" ? [] : [[name, text] as const];
    }),
  );
  return {
    ...withoutViewOwned(previous),
    ...(view.screenSlot === undefined || view.screenSlot.trim() === ""
      ? {}
      : { screen: { materialSlot: screenSlotOf(view.screenSlot.trim(), templateMaterialSlots(previous)) } }),
    ...(view.mirrorSlot === undefined || view.mirrorSlot.trim() === ""
      ? {}
      : { mirror: { materialSlot: screenSlotOf(view.mirrorSlot.trim(), templateMaterialSlots(previous)) } }),
    ...(category === undefined || category === "" ? {} : { category }),
    ...(tags.length === 0 ? {} : { tags }),
    ...(product === undefined ? {} : { product }),
    ...(Object.keys(formulas).length === 0 ? {} : { formulas }),
    materialSlots: Object.fromEntries(
      Object.entries(previous.materialSlots).map(([slot, value]) => [
        slot,
        slotFromView(view.slots[slot], value),
      ]),
    ),
    label: view.label,
    kind: view.kind,
    contract: view.contract,
    attachment: {
      ...previous.attachment,
      hosts: [...view.hosts],
      contact: view.contact,
      defaultHostSide: view.defaultHostSide,
      defaultPlacement: {
        ...previous.attachment.defaultPlacement,
        bottomMm: view.bottomMm,
        elevationMm: view.elevationMm,
        topInsetMm: view.topInsetMm,
      },
    },
    resize: {
      x: viewToAxis(view.x, previous.resize.x),
      y: viewToAxis(view.y, previous.resize.y),
      z: viewToAxis(view.z, previous.resize.z),
    },
    flip: { x: view.flipX, z: view.flipZ },
    opening: view.hasOpening ? { shape: "bounds", clearanceMm: view.clearanceMm ?? 0 } : null,
  };
};

/**
 * The panel schema of a draft's metadata: MetadataFormView with `slots` listing one group per material slot
 * (presets offered from the asset's materials) and `formulas` one field per named formula.
 */
export const metadataFormSchema = (
  metadata: TemplateMetadata,
  materialNames: readonly string[],
): SchemaNode => {
  const properties = MetadataFormView.properties;
  const slotProperties = SlotChoiceView.properties;
  const presets = slotProperties.presets;
  const slotNode = (slot: string): SchemaNode => ({
    ...SlotChoiceView,
    title: `Material slot “${slot}”`,
    properties: {
      ...slotProperties,
      presets: { ...presets, items: { type: "string", enum: [...materialNames] } },
    },
  });
  const slots = Object.keys(metadata.materialSlots);
  const formulas = Object.keys(metadata.formulas ?? {});
  return {
    ...MetadataFormView,
    properties: {
      ...properties,
      slots: {
        title: "Material choices",
        type: "object",
        "x-homeplan": { group: "picker", order: 10 },
        properties: Object.fromEntries(slots.map((slot) => [slot, slotNode(slot)])),
        additionalProperties: false,
      },
      formulas: {
        title: "Formulas",
        type: "object",
        "x-homeplan": { group: "picker", order: 20, hidden: formulas.length === 0 },
        properties: Object.fromEntries(
          formulas.map((name, index) => [
            name,
            { type: "string", title: name, maxLength: 500, "x-homeplan": { editor: "text", order: index } },
          ]),
        ),
        additionalProperties: false,
      },
    },
  };
};

/** Field errors of the metadata form, from metadata validation issues (formulas, presets, mirror). */
export const metadataFormErrors = (issues: readonly ValidationIssue[]): Readonly<Record<string, string>> => {
  const errors: Record<string, string> = {};
  for (const item of issues) {
    const formula = /^\/formulas\/([^/]+)$/.exec(item.pointer);
    const preset = /^\/materialSlots\/([^/]+)\/presets$/.exec(item.pointer);
    const field =
      formula?.[1] !== undefined
        ? `/formulas/${formula[1]}`
        : preset?.[1] !== undefined
          ? `/slots/${preset[1]}/presets`
          : item.pointer === "/mirror/materialSlot"
            ? "/mirrorSlot"
            : item.pointer === "/screen/materialSlot"
              ? "/screenSlot"
              : undefined;
    if (field !== undefined && errors[field] === undefined) errors[field] = item.message;
  }
  return errors;
};

const formulaField = (title: string, order: number) =>
  Type.Optional(Type.String({ title, maxLength: 500, ...hp({ editor: "text", group: "rules", order }) }));

export const NodeRuleFormView = Type.Object(
  {
    pinX: Choice(
      [
        ["none", "—"],
        ["start", "Start"],
        ["center", "Center"],
        ["end", "End"],
      ],
      { title: "Pin X", order: 1 },
    ),
    pinY: Choice(
      [
        ["none", "—"],
        ["start", "Start"],
        ["center", "Center"],
        ["end", "End"],
      ],
      { title: "Pin Y", order: 2 },
    ),
    pinZ: Choice(
      [
        ["none", "—"],
        ["start", "Start"],
        ["center", "Center"],
        ["end", "End"],
      ],
      { title: "Pin Z", order: 3 },
    ),
    stretchX: Type.Boolean({ title: "Stretch X", ...hp({ editor: "toggle", order: 4 }) }),
    stretchY: Type.Boolean({ title: "Stretch Y", ...hp({ editor: "toggle", order: 5 }) }),
    stretchZ: Type.Boolean({ title: "Stretch Z", ...hp({ editor: "toggle", order: 6 }) }),
    repeat: Type.Boolean({ title: "Repeat", ...hp({ editor: "toggle", order: 7 }) }),
    repeatOffsetXMm: Type.Optional(Length({ title: "Repeat offset X", order: 8 })),
    repeatOffsetYMm: Type.Optional(Length({ title: "Repeat offset Y", order: 9 })),
    repeatOffsetZMm: Type.Optional(Length({ title: "Repeat offset Z", order: 10 })),
    repeatCount: Type.Optional(
      Type.String({
        title: "Count: parameter, number, or formula (empty = fill)",
        maxLength: 40,
        ...hp({ editor: "text", order: 11, visibleWhen: { property: "repeat", equals: true } }),
      }),
    ),
    follows: Type.Optional(
      Type.String({ title: "Follows repeat of", ...hp({ editor: "nodeRef", order: 12 }) }),
    ),
    extendsWith: Type.Optional(
      Type.String({ title: "Extends with repeat of", ...hp({ editor: "nodeRef", order: 13 }) }),
    ),
    linearEmitter: Type.Boolean({ title: "Linear light emitter", ...hp({ editor: "toggle", order: 14 }) }),
    visible: formulaField("Visible: true, false, or formula (empty = always)", 1),
    rotateAxis: Choice(
      [
        ["none", "—"],
        ["x", "X"],
        ["y", "Y"],
        ["z", "Z"],
      ],
      { title: "Rotate about", group: "rules", order: 2 },
    ),
    rotateAngleDeg: formulaField("Rotate angle: degrees or formula", 3),
    rotatePivot: Type.Optional(
      Type.String({ title: "Rotate pivot", readOnly: true, ...hp({ group: "rules", order: 4 }) }),
    ),
    rotatePerCopy: Type.Boolean({
      title: "Each repeated copy turns about its own pivot",
      ...hp({ editor: "toggle", group: "rules", order: 5 }),
    }),
    translateX: formulaField("Move X: mm or formula", 6),
    translateY: formulaField("Move Y: mm or formula", 7),
    translateZ: formulaField("Move Z: mm or formula", 8),
    sizeX: formulaField("Size X: mm or formula", 9),
    sizeY: formulaField("Size Y: mm or formula", 10),
    sizeZ: formulaField("Size Z: mm or formula", 11),
    faceInterior: Type.Boolean({
      title: "Keeps to the room face when flipped front/back",
      ...hp({ editor: "toggle", group: "rules", order: 12 }),
    }),
  },
  {
    additionalProperties: false,
    ...hp({ groups: [{ id: "rules", title: "Parametric rules (formulas)" }] }),
  },
);

export type NodeRuleFormViewValue = Static<typeof NodeRuleFormView>;

const countText = (count: RepeatCount): string =>
  count === "fill" ? "" : typeof count === "object" ? count.parameter : String(count);

const parameterNameText = /^[A-Za-z][A-Za-z0-9]*$/;

/**
 * The typed count: empty = fill, a number, or a formula. A bare name stays the previous `{ parameter }` count
 * when it names that parameter (keeping its factor/add); otherwise it is stored as a formula, which reads a
 * parameter or a named formula alike (Phase 9.1: a named formula was wrongly stored as a parameter).
 */
const countFromText = (text: string, previous: RepeatCount | undefined): RepeatCount => {
  const trimmed = text.trim();
  if (trimmed === "") return "fill";
  if (parameterNameText.test(trimmed) && typeof previous === "object" && previous.parameter === trimmed)
    return previous;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
};

/** A numeric offset shown in the form (formula offsets are kept but not shown). */
const numericOffset = (value: number | string | undefined): number | undefined =>
  typeof value === "number" ? value : undefined;

/** The previous offset when the form left it empty and it was a formula. */
const offsetFromView = (
  value: number | undefined,
  previous: number | string | undefined,
): number | string | undefined => value ?? (typeof previous === "string" ? previous : undefined);

export const toNodeRuleView = (rule: NodeRule | undefined): NodeRuleFormViewValue => {
  const count = rule?.repeat?.count;
  const offsetX = numericOffset(rule?.repeat?.offsetMm.x);
  const offsetY = numericOffset(rule?.repeat?.offsetMm.y);
  const offsetZ = numericOffset(rule?.repeat?.offsetMm.z);
  return {
    pinX: rule?.pin?.x ?? "none",
    pinY: rule?.pin?.y ?? "none",
    pinZ: rule?.pin?.z ?? "none",
    stretchX: rule?.stretch?.x ?? false,
    stretchY: rule?.stretch?.y ?? false,
    stretchZ: rule?.stretch?.z ?? false,
    repeat: rule?.repeat !== undefined,
    ...(offsetX === undefined ? {} : { repeatOffsetXMm: offsetX }),
    ...(offsetY === undefined ? {} : { repeatOffsetYMm: offsetY }),
    ...(offsetZ === undefined ? {} : { repeatOffsetZMm: offsetZ }),
    ...(count === undefined ? {} : { repeatCount: countText(count) }),
    ...(rule?.follows === undefined ? {} : { follows: rule.follows }),
    ...(rule?.extendsWith === undefined ? {} : { extendsWith: rule.extendsWith }),
    linearEmitter: rule?.emitter === "linear",
    ...textOf("visible", rule?.visible),
    rotateAxis: rule?.rotate?.axis ?? "none",
    ...textOf("rotateAngleDeg", rule?.rotate?.angleDeg),
    ...(rule?.rotate === undefined ? {} : { rotatePivot: pivotText(rule.rotate.pivot) }),
    rotatePerCopy: rule?.rotate?.perCopy === true,
    ...textOf("translateX", rule?.translate?.x),
    ...textOf("translateY", rule?.translate?.y),
    ...textOf("translateZ", rule?.translate?.z),
    ...textOf("sizeX", rule?.size?.x),
    ...textOf("sizeY", rule?.size?.y),
    ...textOf("sizeZ", rule?.size?.z),
    faceInterior: rule?.face === "interior",
  };
};

/** A number, boolean, or formula as form text (absent = no field value). */
const textOf = <K extends string>(
  key: K,
  value: number | boolean | string | undefined,
): Partial<Record<K, string>> => {
  const result: Partial<Record<K, string>> = {};
  if (value !== undefined) result[key] = String(value);
  return result;
};

const numberText = /^-?(\d+(\.\d*)?|\.\d+)$/;

/** Form text back to a number or a formula; empty = absent. */
const numberOrFormula = (text: string | undefined): number | string | undefined => {
  const trimmed = text?.trim() ?? "";
  if (trimmed === "") return undefined;
  return numberText.test(trimmed) ? Number(trimmed) : trimmed;
};

/** Form text back to a boolean or a formula; empty = absent. */
const booleanOrFormula = (text: string | undefined): boolean | string | undefined => {
  const trimmed = text?.trim() ?? "";
  if (trimmed === "") return undefined;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return trimmed;
};

type Vector = { x?: number | string; y?: number | string; z?: number | string };

const vectorOf = (
  x: string | undefined,
  y: string | undefined,
  z: string | undefined,
): Vector | undefined => {
  const vector: Vector = {};
  const values = { x: numberOrFormula(x), y: numberOrFormula(y), z: numberOrFormula(z) };
  for (const axis of ["x", "y", "z"] as const) {
    const value = values[axis];
    if (value !== undefined) vector[axis] = value;
  }
  return Object.keys(vector).length === 0 ? undefined : vector;
};

const pivotAxisText = (pivot: PivotAxis | undefined): string => {
  if (pivot === undefined) return "center";
  if (typeof pivot === "string") return pivot;
  const offset = pivot.offsetMm === undefined ? "" : ` ${String(pivot.offsetMm)} mm`;
  return `${pivot.at ?? "center"}${pivot.of === "template" ? " of the object" : ""}${offset}`;
};

/** "x start, y center, z end": the pivot as authored in the asset (edited there; kept on save). */
const pivotText = (pivot: NonNullable<NodeRule["rotate"]>["pivot"]): string =>
  (["x", "y", "z"] as const).map((axis) => `${axis} ${pivotAxisText(pivot?.[axis])}`).join(", ");

/** Field errors of the node-rule form, from metadata validation issues of that node. */
export const nodeRuleFormErrors = (
  issues: readonly ValidationIssue[],
  nodeName: string,
): Readonly<Record<string, string>> => {
  const prefix = `/nodes/${nodeName}`;
  const fields: Readonly<Record<string, string>> = {
    "/visible": "/visible",
    "/rotate/angleDeg": "/rotateAngleDeg",
    "/rotate/perCopy": "/rotatePerCopy",
    "/translate/x": "/translateX",
    "/translate/y": "/translateY",
    "/translate/z": "/translateZ",
    "/size/x": "/sizeX",
    "/size/y": "/sizeY",
    "/size/z": "/sizeZ",
    "/repeat/count": "/repeatCount",
    "/repeat/offsetMm/x": "/repeatOffsetXMm",
    "/repeat/offsetMm/y": "/repeatOffsetYMm",
    "/repeat/offsetMm/z": "/repeatOffsetZMm",
    "/follows": "/follows",
    "/extendsWith": "/extendsWith",
  };
  const errors: Record<string, string> = {};
  for (const item of issues) {
    if (!item.pointer.startsWith(`${prefix}/`)) continue;
    const field = fields[item.pointer.slice(prefix.length)];
    if (field !== undefined && errors[field] === undefined) errors[field] = item.message;
  }
  return errors;
};

/**
 * Returns undefined when the node has no rule at all. What the form does not edit (a rotation's pivot, formula
 * repeat offsets) is kept from `previous`.
 */
export const fromNodeRuleView = (view: NodeRuleFormViewValue, previous?: NodeRule): NodeRule | undefined => {
  const previousOffset = previous?.repeat?.offsetMm;
  const offsetX = offsetFromView(view.repeatOffsetXMm, previousOffset?.x);
  const offsetY = offsetFromView(view.repeatOffsetYMm, previousOffset?.y);
  const offsetZ = offsetFromView(view.repeatOffsetZMm, previousOffset?.z);
  const pin = {
    ...(view.pinX === "none" ? {} : { x: view.pinX }),
    ...(view.pinY === "none" ? {} : { y: view.pinY }),
    ...(view.pinZ === "none" ? {} : { z: view.pinZ }),
  };
  const stretch = {
    ...(view.stretchX ? { x: true } : {}),
    ...(view.stretchY ? { y: true } : {}),
    ...(view.stretchZ ? { z: true } : {}),
  };
  const size = vectorOf(view.sizeX, view.sizeY, view.sizeZ);
  const translate = vectorOf(view.translateX, view.translateY, view.translateZ);
  const visible = booleanOrFormula(view.visible);
  const pivot = previous?.rotate?.pivot;
  const rule: NodeRule = {
    ...(size === undefined ? {} : { size }),
    ...(visible === undefined ? {} : { visible }),
    ...(view.rotateAxis === "none"
      ? {}
      : {
          rotate: {
            axis: view.rotateAxis,
            angleDeg: numberOrFormula(view.rotateAngleDeg) ?? 0,
            ...(pivot === undefined ? {} : { pivot }),
            ...(view.rotatePerCopy ? { perCopy: true } : {}),
          },
        }),
    ...(translate === undefined ? {} : { translate }),
    ...(view.faceInterior ? { face: "interior" as const } : {}),
    ...(Object.keys(pin).length === 0 ? {} : { pin }),
    ...(Object.keys(stretch).length === 0 ? {} : { stretch }),
    ...(view.repeat
      ? {
          repeat: {
            offsetMm: {
              ...(offsetX === undefined ? {} : { x: offsetX }),
              ...(offsetY === undefined ? {} : { y: offsetY }),
              ...(offsetZ === undefined ? {} : { z: offsetZ }),
            },
            count: countFromText(view.repeatCount ?? "", previous?.repeat?.count),
          },
        }
      : {}),
    ...(view.follows === undefined || view.follows === "" ? {} : { follows: view.follows }),
    ...(view.extendsWith === undefined || view.extendsWith === "" ? {} : { extendsWith: view.extendsWith }),
    ...(view.linearEmitter ? { emitter: "linear" as const } : {}),
  };
  return Object.keys(rule).length === 0 ? undefined : rule;
};
