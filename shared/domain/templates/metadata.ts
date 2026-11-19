// Homeplan template metadata in glTF `extras.homeplan` (spec/builder/features/object-templates.md, D17, D26).
// Scene-level metadata describes the contract, attachment, resizing, flips, opening, material slots, the
// picker category and product information, extra parameters, and named formulas; node-level rules (pin,
// stretch, repeat, follows, extendsWith, emitter, size, visible, rotate, translate, face) steer the resize
// engine (shared/geometry/templateResize.ts). Axes are glTF's: x = width, y = height (up), z = depth (front +Z).
import Type from "typebox";
import type { Static } from "typebox";
import { XHomeplanSchema } from "../schemas/annotations";
import { TemplateEffect } from "../schemas/effects";
import { isSchemaNode } from "../schemas/schemaWalk";
import type { SchemaNode } from "../schemas/schemaWalk";
import { Length } from "../schemas/values";
import { compileValidator, toIssues } from "../validation/ajv";
import type { ValidationIssue } from "../validation/ajv";
import { checkFormula, formulaFunctions, maxFormulaLength, orderNamedFormulas } from "./formula";
import type { FormulaNameInfo, FormulaScope, FormulaType } from "./formula";

export const templateMetadataSchemaVersion = 1;

const parameterNamePattern = "^[A-Za-z][A-Za-z0-9]*$";
const ParameterName = Type.String({ pattern: parameterNamePattern });
const NonNegativeMm = Type.Number({ minimum: 0 });
const PositiveMm = Type.Number({ exclusiveMinimum: 0 });
/** A formula (D26, shared/domain/templates/formula.ts). */
export const FormulaSchema = Type.String({ minLength: 1, maxLength: maxFormulaLength });
/** A number, or a formula giving one. */
export const NumberOrFormulaSchema = Type.Union([Type.Number(), FormulaSchema]);
/** A boolean, or a formula giving one. */
export const BooleanOrFormulaSchema = Type.Union([Type.Boolean(), FormulaSchema]);
const HelpText = Type.String({ minLength: 1, maxLength: 500 });
const QuickPicks = Type.Array(PositiveMm, { minItems: 1, maxItems: 24 });

export const resizeModes = ["fixed", "scale", "slice", "fitHostDepth"] as const;
export type ResizeMode = (typeof resizeModes)[number];

export const WallPositionSchema = Type.Union([
  Type.Literal("interior"),
  Type.Literal("center"),
  Type.Literal("exterior"),
]);
export type WallPosition = Static<typeof WallPositionSchema>;

/**
 * Resizing of one template axis. `parameter` names the instance parameter that sets the axis size
 * (default `widthMm`/`heightMm`/`depthMm` for x/y/z); `null` means the axis has no size parameter and
 * its middle band keeps its natural size (only bands bound through `startParameter`/`endParameter` change).
 */
export const AxisResizeSchema = Type.Object(
  {
    mode: Type.Union([
      Type.Literal("fixed"),
      Type.Literal("scale"),
      Type.Literal("slice"),
      Type.Literal("fitHostDepth"),
    ]),
    parameter: Type.Optional(Type.Union([ParameterName, Type.Null()])),
    title: Type.Optional(Type.String({ minLength: 1 })),
    /** Help text of the size parameter (Phase 9). */
    description: Type.Optional(HelpText),
    /** Suggested sizes (mm) offered next to the size parameter (Phase 9), e.g. standard bed widths. */
    quickPicks: Type.Optional(QuickPicks),
    startMm: Type.Optional(NonNegativeMm),
    endMm: Type.Optional(NonNegativeMm),
    startParameter: Type.Optional(ParameterName),
    endParameter: Type.Optional(ParameterName),
    minMm: Type.Optional(PositiveMm),
    maxMm: Type.Optional(PositiveMm),
    defaultMm: Type.Optional(PositiveMm),
    wallPosition: Type.Optional(WallPositionSchema),
    wallOffsetMm: Type.Optional(Type.Number()),
  },
  { additionalProperties: false },
);
export type AxisResize = Static<typeof AxisResizeSchema>;

export const attachmentHosts = ["wall", "floor", "overhead", "staircaseArea", "roof"] as const;
export type AttachmentHost = (typeof attachmentHosts)[number];

/** Bounding-box contact faces; any other `contact` value names an anchor node. */
export const contactFaces = ["back", "bottom", "top"] as const;
export type ContactFace = (typeof contactFaces)[number];

export const DefaultPlacementSchema = Type.Object(
  {
    bottomMm: Type.Optional(Type.Number({ minimum: 0 })),
    elevationMm: Type.Optional(Type.Number()),
    horizontalAlign: Type.Optional(
      Type.Union([Type.Literal("start"), Type.Literal("center"), Type.Literal("end")]),
    ),
    verticalAlign: Type.Optional(
      Type.Union([Type.Literal("bottom"), Type.Literal("center"), Type.Literal("top")]),
    ),
    topInsetMm: Type.Optional(Type.Number({ minimum: 0 })),
  },
  { additionalProperties: false },
);
export type DefaultPlacement = Static<typeof DefaultPlacementSchema>;

export const AttachmentSchema = Type.Object(
  {
    hosts: Type.Array(
      Type.Union([
        Type.Literal("wall"),
        Type.Literal("floor"),
        Type.Literal("overhead"),
        Type.Literal("staircaseArea"),
        // A roof face (Phase 19.3): roof windows.
        Type.Literal("roof"),
      ]),
      { minItems: 1, uniqueItems: true },
    ),
    contact: Type.String({ minLength: 1 }),
    defaultHostSide: Type.Optional(Type.Union([Type.Literal("interior"), Type.Literal("exterior")])),
    defaultPlacement: Type.Optional(DefaultPlacementSchema),
  },
  { additionalProperties: false },
);
export type Attachment = Static<typeof AttachmentSchema>;

export const OpeningSchema = Type.Union([
  Type.Object({ shape: Type.Literal("bounds"), clearanceMm: NonNegativeMm }, { additionalProperties: false }),
  Type.Null(),
]);
export type TemplateOpening = Static<typeof OpeningSchema>;

/** Light defaults of a fixture template; the Light object copies them on insertion (D08). */
export const FixtureLightSchema = Type.Object(
  {
    shape: Type.Union([Type.Literal("point"), Type.Literal("spot"), Type.Literal("linear")]),
    outputLumens: PositiveMm,
    colorModes: Type.Array(
      Type.Union([Type.Literal("fixedWhite"), Type.Literal("colorTemperature"), Type.Literal("rgb")]),
      {
        minItems: 1,
        uniqueItems: true,
      },
    ),
    kelvin: Type.Optional(Type.Number({ minimum: 1000, maximum: 12000 })),
    minKelvin: Type.Optional(Type.Number({ minimum: 1000, maximum: 12000 })),
    maxKelvin: Type.Optional(Type.Number({ minimum: 1000, maximum: 12000 })),
  },
  { additionalProperties: false },
);
export type FixtureLight = Static<typeof FixtureLightSchema>;

/**
 * The screen of a display template (a TV, Phase 8.8): the material slot whose meshes are the screen. The HA
 * viewer shows a bound `media_player`'s picture on the screen's front (+z) face; the builder draws it as authored.
 */
export const TemplateScreenSchema = Type.Object(
  { materialSlot: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);
export type TemplateScreen = Static<typeof TemplateScreenSchema>;

/** A surface that reflects its surroundings (Phase 9): the material slot whose meshes are a mirror. */
export const TemplateMirrorSchema = Type.Object(
  { materialSlot: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);
export type TemplateMirror = Static<typeof TemplateMirrorSchema>;

/**
 * A material slot: the glTF material name, or (Phase 9) an object that also says how the slot is offered.
 * `presets` name other glTF materials in the same asset (finishes shipped with the template, such as oak,
 * wenge, white); `allowColor` and `allowTexture` allow a plain colour or the house's own texture.
 */
export const MaterialSlotSchema = Type.Union([
  Type.String({ minLength: 1 }),
  Type.Object(
    {
      material: Type.String({ minLength: 1 }),
      title: Type.Optional(Type.String({ minLength: 1, maxLength: 60 })),
      choosable: Type.Optional(Type.Boolean()),
      presets: Type.Optional(
        Type.Array(Type.String({ minLength: 1 }), { minItems: 1, maxItems: 32, uniqueItems: true }),
      ),
      allowColor: Type.Optional(Type.Boolean()),
      allowTexture: Type.Optional(Type.Boolean()),
    },
    { additionalProperties: false },
  ),
]);
export type MaterialSlot = Static<typeof MaterialSlotSchema>;

/** Product information shown in the picker and the property panel (Phase 9). */
export const TemplateProductSchema = Type.Object(
  {
    manufacturer: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    code: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    url: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
    description: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
    notes: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
  },
  { additionalProperties: false },
);
export type TemplateProduct = Static<typeof TemplateProductSchema>;

/**
 * A floor-cutting object (Phase 16.14, spec/builder/features/staircase-areas.md): the object cuts the floor it
 * stands on by its plan footprint (`widthMm` × `depthMm`); an Areable with it is a floor opening.
 */
export const TemplateFloorCutSchema = Type.Object(
  { shape: Type.Union([Type.Literal("rectangle"), Type.Literal("ellipse")]) },
  { additionalProperties: false },
);
export type TemplateFloorCut = Static<typeof TemplateFloorCutSchema>;

/**
 * A roof window (Phase 19.3, spec/builder/features/object-templates.md#roof-windows): a Wallable hosted by a roof
 * face, sized by `widthMm` (x, level across the slope) and `heightMm` (y, up the slope), for slopes between its
 * pitch limits (degrees). The limits are copied into each placed window.
 */
export const TemplateRoofWindowSchema = Type.Object(
  {
    minPitchDeg: Type.Number({ minimum: 0, maximum: 90 }),
    maxPitchDeg: Type.Number({ minimum: 0, maximum: 90 }),
  },
  { additionalProperties: false },
);
export type TemplateRoofWindow = Static<typeof TemplateRoofWindowSchema>;

/** Picker kind of a roof-window template. */
export const roofWindowKind = "roofWindow";

/** Picker kind of a floor-opening template (the Floor opening picker offers only these). */
export const floorOpeningKind = "floorOpening";

/** Size parameter names a floor-cutting template must use (the cut and rise are read from the instance alone). */
export const floorCutParameters = { x: "widthMm", y: "totalRiseMm", z: "depthMm" } as const;

/** Scene `extras.homeplan`. */
export const TemplateMetadataSchema = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    kind: Type.String({ minLength: 1, maxLength: 64 }),
    label: Type.String({ minLength: 1, maxLength: 120 }),
    contract: Type.Union([Type.Literal("Wallable"), Type.Literal("Areable"), Type.Literal("Staircasable")]),
    attachment: AttachmentSchema,
    resize: Type.Object(
      { x: AxisResizeSchema, y: AxisResizeSchema, z: AxisResizeSchema },
      { additionalProperties: false },
    ),
    flip: Type.Object({ x: Type.Boolean(), z: Type.Boolean() }, { additionalProperties: false }),
    opening: OpeningSchema,
    materialSlots: Type.Record(Type.String({ minLength: 1 }), MaterialSlotSchema),
    /** Picker category (Phase 9), free text; the spec recommends a vocabulary. */
    category: Type.Optional(Type.String({ minLength: 1, maxLength: 60 })),
    tags: Type.Optional(
      Type.Array(Type.String({ minLength: 1, maxLength: 40 }), { maxItems: 32, uniqueItems: true }),
    ),
    product: Type.Optional(TemplateProductSchema),
    properties: Type.Optional(Type.Record(ParameterName, Type.Unknown())),
    /** Named formulas (D26): derived values that rules and other formulas read by name. */
    formulas: Type.Optional(Type.Record(ParameterName, FormulaSchema)),
    light: Type.Optional(FixtureLightSchema),
    /** Default ambient effects (D24), copied onto each new instance with fresh IDs. Areable only. */
    effects: Type.Optional(Type.Array(TemplateEffect, { maxItems: 8 })),
    /** A display's screen (Phase 8.8): where the HA viewer shows the running app. */
    screen: Type.Optional(TemplateScreenSchema),
    /** A mirror surface (Phase 9; rendering in 9.1). */
    mirror: Type.Optional(TemplateMirrorSchema),
    /** A floor opening's outline (Phase 16.14); Areable or Staircasable only. */
    floorCut: Type.Optional(TemplateFloorCutSchema),
    /** A roof window's pitch limits (Phase 19.3); a roof-hosted Wallable only. */
    roofWindow: Type.Optional(TemplateRoofWindowSchema),
  },
  { additionalProperties: false },
);
export type TemplateMetadata = Static<typeof TemplateMetadataSchema>;

const AxisPinSchema = Type.Union([Type.Literal("start"), Type.Literal("center"), Type.Literal("end")]);
export type AxisPin = Static<typeof AxisPinSchema>;

/**
 * How many copies a repeat makes: `{ parameter, factor, add }` (floor(value × factor + add)), `"fill"` (as
 * many as fit the middle band), a whole number, or a formula (floored).
 */
export const RepeatCountSchema = Type.Union([
  Type.Object(
    {
      parameter: ParameterName,
      factor: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
      add: Type.Optional(Type.Number()),
    },
    { additionalProperties: false },
  ),
  Type.Literal("fill"),
  Type.Integer({ minimum: 0 }),
  FormulaSchema,
]);
export type RepeatCount = Static<typeof RepeatCountSchema>;

const Vector3OrFormula = Type.Object(
  {
    x: Type.Optional(NumberOrFormulaSchema),
    y: Type.Optional(NumberOrFormulaSchema),
    z: Type.Optional(NumberOrFormulaSchema),
  },
  { additionalProperties: false },
);

const PivotAnchorSchema = Type.Union([Type.Literal("start"), Type.Literal("center"), Type.Literal("end")]);
export type PivotAnchor = Static<typeof PivotAnchorSchema>;

/**
 * Where a rotation pivot sits on one axis: an anchor of the part's own bounds, or `{ at, of, offsetMm }`
 * with `of: "template"` for the template's (resized) bounds and an offset in mm (number or formula).
 */
export const PivotAxisSchema = Type.Union([
  PivotAnchorSchema,
  Type.Object(
    {
      at: Type.Optional(PivotAnchorSchema),
      of: Type.Optional(Type.Union([Type.Literal("part"), Type.Literal("template")])),
      offsetMm: Type.Optional(NumberOrFormulaSchema),
    },
    { additionalProperties: false },
  ),
]);
export type PivotAxis = Static<typeof PivotAxisSchema>;

export const RotateRuleSchema = Type.Object(
  {
    axis: Type.Union([Type.Literal("x"), Type.Literal("y"), Type.Literal("z")]),
    /** Degrees, right-hand rule about the positive axis (counter-clockwise looking down from +axis). */
    angleDeg: NumberOrFormulaSchema,
    pivot: Type.Optional(
      Type.Object(
        {
          x: Type.Optional(PivotAxisSchema),
          y: Type.Optional(PivotAxisSchema),
          z: Type.Optional(PivotAxisSchema),
        },
        { additionalProperties: false },
      ),
    ),
    /** Rotate each repeat copy about its own pivot (blind slats) instead of all copies as one. */
    perCopy: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export type RotateRule = Static<typeof RotateRuleSchema>;

/** Node `extras.homeplan`. */
export const NodeRuleSchema = Type.Object(
  {
    pin: Type.Optional(
      Type.Object(
        { x: Type.Optional(AxisPinSchema), y: Type.Optional(AxisPinSchema), z: Type.Optional(AxisPinSchema) },
        { additionalProperties: false },
      ),
    ),
    stretch: Type.Optional(
      Type.Object(
        {
          x: Type.Optional(Type.Boolean()),
          y: Type.Optional(Type.Boolean()),
          z: Type.Optional(Type.Boolean()),
        },
        { additionalProperties: false },
      ),
    ),
    repeat: Type.Optional(
      Type.Object(
        {
          offsetMm: Vector3OrFormula,
          count: RepeatCountSchema,
        },
        { additionalProperties: false },
      ),
    ),
    follows: Type.Optional(Type.String({ minLength: 1 })),
    extendsWith: Type.Optional(Type.String({ minLength: 1 })),
    emitter: Type.Optional(Type.Literal("linear")),
    /** Sets the part's extent (mm) per axis, scaling it about its own centre (picture inset, cushions). */
    size: Type.Optional(Vector3OrFormula),
    /** Shows or hides the part; hidden parts are left out of the output. */
    visible: Type.Optional(BooleanOrFormulaSchema),
    rotate: Type.Optional(RotateRuleSchema),
    /** Moves the part (mm, template axes) after it is rotated: a sliding leaf. */
    translate: Type.Optional(Vector3OrFormula),
    /** `interior`: the part keeps to the template front (+z, the room side) when the instance flips in z. */
    face: Type.Optional(Type.Literal("interior")),
  },
  { additionalProperties: false },
);
export type NodeRule = Static<typeof NodeRuleSchema>;

export type Axis = "x" | "y" | "z";
export const axes: readonly Axis[] = ["x", "y", "z"];

const defaultAxisParameter: Readonly<Record<Axis, string>> = { x: "widthMm", y: "heightMm", z: "depthMm" };
const defaultAxisTitle: Readonly<Record<Axis, string>> = { x: "Width", y: "Height", z: "Depth" };

/** The instance parameter that sets an axis size, or null when the axis has none. */
export const axisSizeParameter = (axis: Axis, resize: AxisResize): string | null => {
  if (resize.mode === "fixed" || resize.mode === "fitHostDepth") return null;
  if (resize.parameter === null) return null;
  return resize.parameter ?? defaultAxisParameter[axis];
};

/** A rule moves its node rigidly (or stretched) instead of following the axis slices. */
export const isRuledNode = (rule: NodeRule | undefined): boolean =>
  rule !== undefined && (rule.pin !== undefined || rule.stretch !== undefined || rule.repeat !== undefined);

export const isContactFace = (contact: string): contact is ContactFace =>
  contact === "back" || contact === "bottom" || contact === "top";

/** The glTF material name of a material slot (either slot form). */
export const materialSlotMaterial = (slot: MaterialSlot): string =>
  typeof slot === "string" ? slot : slot.material;

/** Slot name → glTF material name. */
export const templateMaterialSlots = (metadata: TemplateMetadata): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(metadata.materialSlots).map(([slot, value]): [string, string] => [
      slot,
      materialSlotMaterial(value),
    ]),
  );

// ---------------------------------------------------------------------------------------------
// Formula names (D26). A formula reads the template's resolved parameters, its named `formulas`, and
// these sizes (mm): sizeX/sizeY/sizeZ, the requested size of each axis (the size parameter's value; for a
// fitHostDepth axis the host depth plus its bands; otherwise the authored size), and hostDepthMm (the host
// wall depth, 0 when the object has no host wall).

export const formulaSizeNames = ["sizeX", "sizeY", "sizeZ", "hostDepthMm"] as const;
const reservedNames: ReadonlySet<string> = new Set<string>([
  ...formulaSizeNames,
  "true",
  "false",
  ...Object.keys(formulaFunctions),
]);

/** What a `properties` fragment declares, for formulas and the panel. */
export type TemplatePropertyInfo = FormulaNameInfo & Readonly<{ state: boolean }>;

const validateAnnotation = compileValidator(XHomeplanSchema);

const listOf = (value: unknown): readonly unknown[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const items: readonly unknown[] = value;
  return items;
};

const choicesOf = (fragment: Readonly<Record<string, unknown>>): readonly unknown[] | undefined => {
  const listed = listOf(fragment.enum);
  if (listed !== undefined) return listed;
  const options = listOf(fragment.anyOf) ?? listOf(fragment.oneOf);
  if (options === undefined) return undefined;
  const values: unknown[] = [];
  for (const option of options) {
    if (!isSchemaNode(option) || !("const" in option)) return undefined;
    values.push(option.const);
  }
  return values;
};

type PropertyRead = Readonly<{ info: TemplatePropertyInfo | null; issues: readonly string[] }>;

/** Reads one `properties` fragment: its formula type (number, boolean, or choice/string) and problems. */
export const readTemplateProperty = (fragment: unknown): PropertyRead => {
  if (!isSchemaNode(fragment)) return { info: null, issues: ["A property must be a JSON Schema object"] };
  const issues: string[] = [];
  const annotationValue = fragment["x-homeplan"];
  const annotation = isSchemaNode(annotationValue) ? annotationValue : {};
  if (annotationValue !== undefined && !validateAnnotation(annotationValue))
    issues.push("x-homeplan is not a valid annotation");
  const state = annotation.state === true;
  if (!("default" in fragment)) issues.push("A property needs a default");
  const value = fragment.default;
  const choices = choicesOf(fragment);
  let type: FormulaType | null = null;
  if (fragment.type === "number" || fragment.type === "integer") type = "number";
  else if (fragment.type === "boolean") type = "boolean";
  else if (fragment.type === "string" || choices?.every((choice) => typeof choice === "string") === true)
    type = "string";
  if (type === null) {
    issues.push("A property must be a number, integer, boolean, or string (choice)");
    return { info: null, issues };
  }
  if ("default" in fragment && typeof value !== type) issues.push(`The default must be a ${type}`);
  if (fragment.type === "integer" && typeof value === "number" && !Number.isInteger(value))
    issues.push("The default must be a whole number");
  const minimum = typeof fragment.minimum === "number" ? fragment.minimum : undefined;
  const maximum = typeof fragment.maximum === "number" ? fragment.maximum : undefined;
  if (minimum !== undefined && maximum !== undefined && minimum > maximum)
    issues.push("minimum is larger than maximum");
  if (
    typeof value === "number" &&
    ((minimum !== undefined && value < minimum) || (maximum !== undefined && value > maximum))
  )
    issues.push("The default is outside minimum..maximum");
  const quickPicks = Array.isArray(annotation.quickPicks) ? annotation.quickPicks : undefined;
  if (quickPicks !== undefined) {
    if (type !== "number") issues.push("quickPicks apply only to number parameters");
    else if (
      quickPicks.some(
        (pick) =>
          typeof pick !== "number" ||
          (minimum !== undefined && pick < minimum) ||
          (maximum !== undefined && pick > maximum),
      )
    )
      issues.push("A quick pick is outside minimum..maximum");
  }
  let stringChoices: string[] | undefined;
  if (type === "string" && choices !== undefined) {
    stringChoices = [];
    for (const choice of choices) {
      if (typeof choice === "string") stringChoices.push(choice);
      else issues.push("Every choice must be a string");
    }
    if (stringChoices.length === 0) issues.push("A choice property needs at least one choice");
    if (typeof value === "string" && !stringChoices.includes(value))
      issues.push("The default is not a choice");
  }
  return {
    info: { type, state, ...(stringChoices === undefined ? {} : { choices: stringChoices }) },
    issues,
  };
};

/** Parameter names declared by the template: axis size parameters plus `properties`. */
export const templateParameterNames = (metadata: TemplateMetadata): readonly string[] => {
  const names: string[] = [];
  for (const axis of axes) {
    const name = axisSizeParameter(axis, metadata.resize[axis]);
    if (name !== null) names.push(name);
  }
  return [...names, ...Object.keys(metadata.properties ?? {})];
};

/** Each declared parameter's formula type: axis sizes are numbers, `properties` by their schema. */
export const templateParameterTypes = (
  metadata: TemplateMetadata,
): Readonly<Record<string, FormulaNameInfo>> => {
  const scope: Record<string, FormulaNameInfo> = {};
  for (const axis of axes) {
    const name = axisSizeParameter(axis, metadata.resize[axis]);
    if (name !== null) scope[name] = { type: "number" };
  }
  for (const [name, fragment] of Object.entries(metadata.properties ?? {})) {
    const info = readTemplateProperty(fragment).info;
    if (info !== null)
      scope[name] = { type: info.type, ...(info.choices === undefined ? {} : { choices: info.choices }) };
  }
  return scope;
};

type ScopeBuild = Readonly<{ scope: FormulaScope; issues: readonly ValidationIssue[] }>;

/** The names a template's formulas may read, with the named formulas type-checked in dependency order. */
const buildFormulaScope = (metadata: TemplateMetadata): ScopeBuild => {
  const issues: ValidationIssue[] = [];
  const scope: Record<string, FormulaNameInfo> = { ...templateParameterTypes(metadata) };
  for (const name of formulaSizeNames) scope[name] = { type: "number" };
  const formulas = metadata.formulas ?? {};
  const ordering = orderNamedFormulas(formulas);
  if (!ordering.ok) {
    issues.push(issue("/formulas", `Formulas form a cycle: ${ordering.cycle.join(" → ")}`));
    return { scope, issues };
  }
  for (const name of ordering.order) {
    if (Object.hasOwn(scope, name) || reservedNames.has(name)) {
      issues.push(issue(`/formulas/${name}`, `${name} is already a parameter or a reserved name`));
      continue;
    }
    const check = checkFormula(formulas[name] ?? "", scope);
    if (!check.ok) {
      issues.push(issue(`/formulas/${name}`, check.message));
      continue;
    }
    scope[name] = { type: check.type };
  }
  return { scope, issues };
};

/** The formula scope of a template (parameters, sizes, named formulas); invalid named formulas are left out. */
export const templateFormulaScope = (metadata: TemplateMetadata): FormulaScope =>
  buildFormulaScope(metadata).scope;

// ---------------------------------------------------------------------------------------------
// Reading from glTF extras (Three.js exposes them as `userData`).

const validateMetadataShape = compileValidator(TemplateMetadataSchema);
const validateNodeRuleShape = compileValidator(NodeRuleSchema);

/** The `homeplan` member of a glTF `extras` object, or undefined. */
export const homeplanExtras = (extras: unknown): unknown =>
  isSchemaNode(extras) ? extras.homeplan : undefined;

export type NodeRuleParse = Readonly<{ rule: NodeRule | undefined; issues: readonly ValidationIssue[] }>;

/** Parses a node's `extras.homeplan` value; absent means no rule. */
export const parseNodeRule = (value: unknown): NodeRuleParse => {
  if (value === undefined) return { rule: undefined, issues: [] };
  if (validateNodeRuleShape(value)) return { rule: value, issues: [] };
  return { rule: undefined, issues: toIssues(validateNodeRuleShape.errors) };
};

/** What validation needs to know about the glTF asset besides its metadata. */
export type TemplateAssetSummary = Readonly<{
  /** Every node name in the asset (duplicates included). */
  nodeNames: readonly string[];
  materialNames: readonly string[];
  /** Parsed node rules by node name. */
  nodeRules: Readonly<Record<string, NodeRule>>;
}>;

export type TemplateMetadataValidation = Readonly<{
  metadata: TemplateMetadata | null;
  issues: readonly ValidationIssue[];
}>;

const issue = (pointer: string, message: string): ValidationIssue => ({ pointer, message });

const validateAxis = (
  axis: Axis,
  resize: AxisResize,
  contract: TemplateMetadata["contract"],
  parameterNames: ReadonlySet<string>,
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const at = `/resize/${axis}`;
  const bands = (resize.startMm ?? 0) + (resize.endMm ?? 0);
  if (resize.mode === "fitHostDepth" && (axis !== "z" || contract !== "Wallable"))
    issues.push(issue(`${at}/mode`, "fitHostDepth is only valid on the z axis of a Wallable"));
  if (
    (resize.startMm !== undefined || resize.endMm !== undefined) &&
    resize.mode !== "slice" &&
    resize.mode !== "fitHostDepth"
  )
    issues.push(issue(at, "startMm/endMm apply only to slice and fitHostDepth"));
  if ((resize.startParameter !== undefined || resize.endParameter !== undefined) && resize.mode !== "slice")
    issues.push(issue(at, "startParameter/endParameter apply only to slice"));
  for (const key of ["startParameter", "endParameter"] as const) {
    const name = resize[key];
    if (name !== undefined && !parameterNames.has(name))
      issues.push(issue(`${at}/${key}`, `Parameter ${name} is not declared in properties`));
  }
  if (resize.startParameter !== undefined && resize.startMm === undefined)
    issues.push(issue(`${at}/startMm`, "A band bound to a parameter needs its natural startMm"));
  if (resize.endParameter !== undefined && resize.endMm === undefined)
    issues.push(issue(`${at}/endMm`, "A band bound to a parameter needs its natural endMm"));
  const sized = axisSizeParameter(axis, resize) !== null;
  if (sized) {
    if (resize.defaultMm === undefined)
      issues.push(issue(`${at}/defaultMm`, "A resizable axis needs defaultMm"));
    if (resize.minMm !== undefined && resize.maxMm !== undefined && resize.minMm > resize.maxMm)
      issues.push(issue(at, "minMm is larger than maxMm"));
    if (
      resize.defaultMm !== undefined &&
      ((resize.minMm !== undefined && resize.defaultMm < resize.minMm) ||
        (resize.maxMm !== undefined && resize.defaultMm > resize.maxMm))
    )
      issues.push(issue(`${at}/defaultMm`, "defaultMm is outside minMm..maxMm"));
    if (
      resize.quickPicks?.some(
        (pick) =>
          (resize.minMm !== undefined && pick < resize.minMm) ||
          (resize.maxMm !== undefined && pick > resize.maxMm),
      ) === true
    )
      issues.push(issue(`${at}/quickPicks`, "A quick pick is outside minMm..maxMm"));
    if (resize.mode === "slice" && resize.startParameter === undefined && resize.endParameter === undefined) {
      const minimum = resize.minMm ?? resize.defaultMm ?? 0;
      if (bands > minimum)
        issues.push(issue(at, `Slice bands (${bands} mm) are larger than the minimum size (${minimum} mm)`));
    }
  } else {
    if (resize.minMm !== undefined || resize.maxMm !== undefined || resize.defaultMm !== undefined)
      issues.push(issue(at, "minMm/maxMm/defaultMm apply only to an axis with a size parameter"));
    if (resize.quickPicks !== undefined || resize.description !== undefined)
      issues.push(issue(at, "quickPicks/description apply only to an axis with a size parameter"));
  }
  if (
    (resize.wallPosition !== undefined || resize.wallOffsetMm !== undefined) &&
    (axis !== "z" || contract !== "Wallable" || resize.mode === "fitHostDepth")
  )
    issues.push(issue(at, "wallPosition applies only to the non-fitHostDepth z axis of a Wallable"));
  return issues;
};

/** Checks a number-or-formula / boolean-or-formula field. */
const checkField = (
  issues: ValidationIssue[],
  pointer: string,
  field: number | boolean | string | undefined,
  scope: FormulaScope,
  expected: FormulaType,
): void => {
  if (typeof field !== "string") return;
  const check = checkFormula(field, scope, expected);
  if (!check.ok) issues.push(issue(pointer, `Formula '${field}': ${check.message}`));
};

const checkVector = (
  issues: ValidationIssue[],
  pointer: string,
  vector: Readonly<{ x?: number | string; y?: number | string; z?: number | string }> | undefined,
  scope: FormulaScope,
): void => {
  if (vector === undefined) return;
  for (const axis of axes) checkField(issues, `${pointer}/${axis}`, vector[axis], scope, "number");
};

const validateRuleFormulas = (
  at: string,
  rule: NodeRule,
  scope: FormulaScope,
  parameterNames: ReadonlySet<string>,
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const repeat = rule.repeat;
  if (repeat !== undefined) {
    const offsets = [repeat.offsetMm.x ?? 0, repeat.offsetMm.y ?? 0, repeat.offsetMm.z ?? 0];
    if (offsets.every((offset) => offset === 0))
      issues.push(issue(`${at}/repeat/offsetMm`, "A repeat needs a non-zero offset"));
    checkVector(issues, `${at}/repeat/offsetMm`, repeat.offsetMm, scope);
    const count = repeat.count;
    if (typeof count === "object" && !parameterNames.has(count.parameter))
      issues.push(issue(`${at}/repeat/count`, `Parameter ${count.parameter} is not declared`));
    if (typeof count === "string" && count !== "fill")
      checkField(issues, `${at}/repeat/count`, count, scope, "number");
  }
  checkVector(issues, `${at}/size`, rule.size, scope);
  checkField(issues, `${at}/visible`, rule.visible, scope, "boolean");
  checkVector(issues, `${at}/translate`, rule.translate, scope);
  const rotate = rule.rotate;
  if (rotate !== undefined) {
    checkField(issues, `${at}/rotate/angleDeg`, rotate.angleDeg, scope, "number");
    for (const axis of axes) {
      const pivot = rotate.pivot?.[axis];
      if (typeof pivot === "object")
        checkField(issues, `${at}/rotate/pivot/${axis}/offsetMm`, pivot.offsetMm, scope, "number");
    }
    if (rotate.perCopy === true && repeat === undefined)
      issues.push(issue(`${at}/rotate/perCopy`, "perCopy applies only to a repeated part"));
  }
  return issues;
};

const validateNodeRules = (
  metadata: TemplateMetadata,
  asset: TemplateAssetSummary,
  parameterNames: ReadonlySet<string>,
  scope: FormulaScope,
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const counts = new Map<string, number>();
  for (const name of asset.nodeNames) counts.set(name, (counts.get(name) ?? 0) + 1);
  const requireUniqueNode = (pointer: string, name: string): void => {
    const count = counts.get(name) ?? 0;
    if (count === 0) issues.push(issue(pointer, `Node ${name} does not exist`));
    else if (count > 1) issues.push(issue(pointer, `Node name ${name} is not unique`));
  };
  if (!isContactFace(metadata.attachment.contact))
    requireUniqueNode("/attachment/contact", metadata.attachment.contact);
  for (const [name, rule] of Object.entries(asset.nodeRules)) {
    const at = `/nodes/${name}`;
    requireUniqueNode(at, name);
    issues.push(...validateRuleFormulas(at, rule, scope, parameterNames));
    for (const key of ["follows", "extendsWith"] as const) {
      const target = rule[key];
      if (target === undefined) continue;
      requireUniqueNode(`${at}/${key}`, target);
      const targetRule = asset.nodeRules[target];
      if (targetRule?.repeat === undefined || targetRule.repeat.count === "fill")
        issues.push(issue(`${at}/${key}`, `${target} is not a counted repeat node`));
    }
    let cursor: string | undefined = rule.follows;
    const seen = new Set<string>([name]);
    while (cursor !== undefined) {
      if (seen.has(cursor)) {
        issues.push(issue(`${at}/follows`, "follows forms a cycle"));
        break;
      }
      seen.add(cursor);
      cursor = asset.nodeRules[cursor]?.follows;
    }
    for (const axis of axes) {
      if (rule.pin?.[axis] !== undefined && rule.stretch?.[axis] === true)
        issues.push(issue(at, `Axis ${axis} is both pinned and stretched`));
    }
  }
  const materials = new Set(asset.materialNames);
  for (const [slot, value] of Object.entries(metadata.materialSlots)) {
    const materialName = materialSlotMaterial(value);
    if (!materials.has(materialName))
      issues.push(issue(`/materialSlots/${slot}`, `Material ${materialName} does not exist`));
    if (typeof value === "object")
      for (const preset of value.presets ?? [])
        if (!materials.has(preset))
          issues.push(issue(`/materialSlots/${slot}/presets`, `Preset material ${preset} does not exist`));
  }
  return issues;
};

/**
 * Floor-cutting templates (Phase 16.14): a Staircasable or a floor opening stands on the floor (the legacy
 * `staircaseArea` host counts as the floor) and names its size parameters so the geometry core can read the cut
 * and the rise from the instance alone: x `widthMm`, z `depthMm`, and for a Staircasable y `totalRiseMm`.
 */
const validateFloorCut = (metadata: TemplateMetadata): ValidationIssue[] => {
  const stair = metadata.contract === "Staircasable";
  if (!stair && metadata.floorCut === undefined) return [];
  if (metadata.contract === "Wallable")
    return [issue("/floorCut", "A Wallable cuts its wall, not the floor")];
  const issues: ValidationIssue[] = [];
  const hosts = metadata.attachment.hosts;
  if (!hosts.includes("floor") && !hosts.includes("staircaseArea"))
    issues.push(issue("/attachment/hosts", "A stair or floor opening stands on the floor"));
  const wanted: readonly Axis[] = stair ? ["x", "y", "z"] : ["x", "z"];
  for (const axis of wanted) {
    const name = axisSizeParameter(axis, metadata.resize[axis]);
    if (name !== floorCutParameters[axis])
      issues.push(
        issue(
          `/resize/${axis}`,
          `A stair or floor opening sizes ${axis} by the parameter ${floorCutParameters[axis]}`,
        ),
      );
  }
  return issues;
};

/**
 * Roof windows (Phase 19.3): a roof-hosted Wallable declares its pitch limits (min ≤ max) and sizes x by
 * `widthMm` and y by `heightMm`, so the roof reads its size from the instance alone; nothing else is hosted by a
 * roof.
 */
const validateRoofWindow = (metadata: TemplateMetadata): ValidationIssue[] => {
  const onRoof = metadata.attachment.hosts.includes("roof");
  if (!onRoof && metadata.roofWindow === undefined) return [];
  const issues: ValidationIssue[] = [];
  if (metadata.contract !== "Wallable" || !onRoof || metadata.roofWindow === undefined)
    return [issue("/roofWindow", "A roof window is a Wallable hosted by a roof, with its pitch limits")];
  if (metadata.roofWindow.minPitchDeg > metadata.roofWindow.maxPitchDeg)
    issues.push(issue("/roofWindow", "The lowest pitch is above the highest"));
  if (axisSizeParameter("x", metadata.resize.x) !== "widthMm")
    issues.push(issue("/resize/x", "A roof window sizes x by the parameter widthMm"));
  if (axisSizeParameter("y", metadata.resize.y) !== "heightMm")
    issues.push(issue("/resize/y", "A roof window sizes y by the parameter heightMm"));
  return issues;
};

/**
 * Validates scene-level metadata (shape plus cross-field rules, parameter fragments, named formulas) and,
 * when the asset summary is given, the references between metadata, node rules, nodes, and materials and
 * every node-rule formula.
 */
export const validateTemplateMetadata = (
  value: unknown,
  asset?: TemplateAssetSummary,
): TemplateMetadataValidation => {
  if (!validateMetadataShape(value))
    return { metadata: null, issues: toIssues(validateMetadataShape.errors) };
  const metadata = value;
  const issues: ValidationIssue[] = [];
  const parameterNames = templateParameterNames(metadata);
  const nameSet = new Set<string>();
  for (const name of parameterNames) {
    if (nameSet.has(name)) issues.push(issue("/properties", `Parameter ${name} is declared twice`));
    if (reservedNames.has(name)) issues.push(issue("/properties", `${name} is a reserved formula name`));
    nameSet.add(name);
  }
  for (const axis of axes)
    issues.push(...validateAxis(axis, metadata.resize[axis], metadata.contract, nameSet));
  for (const [name, fragment] of Object.entries(metadata.properties ?? {}))
    for (const message of readTemplateProperty(fragment).issues)
      issues.push(issue(`/properties/${name}`, message));
  const formulaScope = buildFormulaScope(metadata);
  issues.push(...formulaScope.issues);
  if (metadata.contract === "Wallable") {
    if (metadata.opening === null) issues.push(issue("/opening", "A Wallable declares its opening"));
    if (!metadata.attachment.hosts.includes("wall") && !metadata.attachment.hosts.includes("roof"))
      issues.push(issue("/attachment/hosts", "A Wallable is hosted by a wall or a roof"));
  } else if (metadata.opening !== null) {
    issues.push(issue("/opening", "Only a Wallable creates an opening"));
  }
  if (metadata.effects !== undefined && metadata.effects.length > 0 && metadata.contract !== "Areable")
    issues.push(issue("/effects", "Only an Areable carries ambient effects"));
  for (const key of ["screen", "mirror"] as const) {
    const slot = metadata[key]?.materialSlot;
    if (slot !== undefined && !Object.hasOwn(metadata.materialSlots, slot))
      issues.push(issue(`/${key}/materialSlot`, `Material slot ${slot} is not declared in materialSlots`));
  }
  issues.push(...validateFloorCut(metadata));
  issues.push(...validateRoofWindow(metadata));
  if (asset !== undefined) issues.push(...validateNodeRules(metadata, asset, nameSet, formulaScope.scope));
  return { metadata: issues.length === 0 ? metadata : null, issues };
};

/** The picker fields a template declares (category, tags, product), for manifests and the template list. */
export const templatePickerFields = (
  metadata: TemplateMetadata,
): Readonly<{ category?: string; tags?: string[]; product?: TemplateProduct }> => ({
  ...(metadata.category === undefined ? {} : { category: metadata.category }),
  ...(metadata.tags === undefined || metadata.tags.length === 0 ? {} : { tags: [...metadata.tags] }),
  ...(metadata.product === undefined || Object.keys(metadata.product).length === 0
    ? {}
    : { product: { ...metadata.product } }),
});

// ---------------------------------------------------------------------------------------------
// Parameters (D18: the property panel reads these through withTemplateParameters).

export type TemplateParameterValue = number | boolean | string;

export type TemplateParameterSchema = Readonly<{
  properties: Readonly<Record<string, object>>;
  required: readonly string[];
  defaults: Readonly<Record<string, TemplateParameterValue>>;
  /** Panel groups of the `properties` parameters (Settings, State); axis sizes stay loose (the Size group). */
  groups: readonly Readonly<{ id: string; title: string }>[];
}>;

const isParameterValue = (value: unknown): value is TemplateParameterValue =>
  typeof value === "number" || typeof value === "boolean" || typeof value === "string";

/** Panel groups of template parameters (Phase 9.1): ordinary settings, then live state. */
export const templateParameterGroups = [
  { id: "settings", title: "Settings" },
  { id: "state", title: "State" },
] as const;

/** "tiltTop" → "Tilt top", "left-hand" → "Left hand": the panel label of a bare enum value. */
export const choiceTitle = (value: string): string => {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .toLowerCase();
  return words === "" ? value : `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
};

/**
 * The panel form of one `properties` fragment (Phase 9.1): grouped under Settings or State, a bare `enum` turned
 * into titled `anyOf` consts, and a choice without a declared editor shown as a segmented control (2–3 choices)
 * or a dropdown, as the design system's `Choice` does. Everything else stays as authored.
 */
const panelFragment = (fragment: SchemaNode): SchemaNode => {
  const info = readTemplateProperty(fragment).info;
  const annotationValue = fragment["x-homeplan"];
  const annotation = isSchemaNode(annotationValue) ? annotationValue : {};
  const enumValues = listOf(fragment.enum);
  const { enum: _enum, ...rest } = fragment;
  const choices = info?.choices;
  const titled =
    enumValues === undefined || choices === undefined
      ? fragment
      : { ...rest, anyOf: choices.map((value) => ({ const: value, title: choiceTitle(value) })) };
  const editor =
    annotation.editor === undefined && choices !== undefined
      ? { editor: choices.length <= 3 ? "segmented" : "select" }
      : {};
  return {
    ...titled,
    "x-homeplan": { ...annotation, ...editor, group: info?.state === true ? "state" : "settings" },
  };
};

/**
 * Parameter schemas of a template: one `Length` per axis with a size parameter (limits, help text, and quick
 * picks from the axis), then the `properties` fragments (grouped as Settings or State for the panel). Every
 * parameter is required; defaults are copied on insertion (D07).
 */
export const templateParameterSchema = (metadata: TemplateMetadata): TemplateParameterSchema => {
  const properties: Record<string, object> = {};
  const defaults: Record<string, TemplateParameterValue> = {};
  let order = 1;
  for (const axis of axes) {
    const resize = metadata.resize[axis];
    const name = axisSizeParameter(axis, resize);
    if (name === null) continue;
    properties[name] = Length({
      title: resize.title ?? defaultAxisTitle[axis],
      ...(resize.minMm === undefined ? { exclusiveMinimum: 0 } : { minimum: resize.minMm }),
      ...(resize.maxMm === undefined ? {} : { maximum: resize.maxMm }),
      ...(resize.defaultMm === undefined ? {} : { default: resize.defaultMm }),
      ...(resize.description === undefined ? {} : { description: resize.description }),
      ...(resize.quickPicks === undefined ? {} : { quickPicks: resize.quickPicks }),
      order,
    });
    if (resize.defaultMm !== undefined) defaults[name] = resize.defaultMm;
    order += 1;
  }
  for (const [name, fragment] of Object.entries(metadata.properties ?? {})) {
    if (!isSchemaNode(fragment)) continue;
    properties[name] = panelFragment(fragment);
    const value = fragment.default;
    if (isParameterValue(value)) defaults[name] = value;
  }
  return { properties, required: Object.keys(properties), defaults, groups: templateParameterGroups };
};

/** The parameters a new instance starts with (template defaults, D07). */
export const defaultInstanceParameters = (
  metadata: TemplateMetadata,
): Record<string, TemplateParameterValue> => ({
  ...templateParameterSchema(metadata).defaults,
});

/** Names of the parameters a template marks as live state (`x-homeplan.state`), e.g. for HA bindings. */
export const templateStateParameters = (metadata: TemplateMetadata): readonly string[] =>
  Object.entries(metadata.properties ?? {}).flatMap(([name, fragment]) =>
    readTemplateProperty(fragment).info?.state === true ? [name] : [],
  );

/** A live-state parameter as a Home Assistant binding shows and drives it (Phase 9.7). */
export type TemplateStateParameter = Readonly<{
  name: string;
  /** The fragment's `title`, else the name in words. */
  title: string;
  description?: string;
  type: FormulaType;
  /** Choice parameters: each value with its title (`anyOf` titles, else the value in words). */
  choices?: readonly Readonly<{ value: string; title: string }>[];
  minimum?: number;
  maximum?: number;
  /** "°" for angles, "mm" for lengths (`x-homeplan.quantity`), else absent. */
  unit?: string;
  default: TemplateParameterValue;
}>;

const choiceTitles = (fragment: SchemaNode, choices: readonly string[]): Map<string, string> => {
  const titles = new Map<string, string>();
  for (const option of listOf(fragment.anyOf) ?? listOf(fragment.oneOf) ?? [])
    if (isSchemaNode(option) && typeof option.const === "string" && typeof option.title === "string")
      titles.set(option.const, option.title);
  for (const value of choices) if (!titles.has(value)) titles.set(value, choiceTitle(value));
  return titles;
};

/**
 * The template's live-state parameters (`x-homeplan.state`) with what a binding editor and the live override need:
 * title, type, choices, limits, unit, and default. Parameters whose fragment does not read cleanly are left out.
 */
export const templateStateParameterInfo = (metadata: TemplateMetadata): readonly TemplateStateParameter[] =>
  Object.entries(metadata.properties ?? {}).flatMap(([name, fragment]): TemplateStateParameter[] => {
    if (!isSchemaNode(fragment)) return [];
    const info = readTemplateProperty(fragment).info;
    const value = fragment.default;
    if (info?.state !== true || !isParameterValue(value) || typeof value !== info.type) return [];
    const annotationValue = fragment["x-homeplan"];
    const quantity = isSchemaNode(annotationValue) ? annotationValue.quantity : undefined;
    const titles = info.choices === undefined ? undefined : choiceTitles(fragment, info.choices);
    return [
      {
        name,
        title: typeof fragment.title === "string" ? fragment.title : choiceTitle(name),
        ...(typeof fragment.description === "string" ? { description: fragment.description } : {}),
        type: info.type,
        ...(info.choices === undefined || titles === undefined
          ? {}
          : {
              choices: info.choices.map((choice) => ({ value: choice, title: titles.get(choice) ?? choice })),
            }),
        ...(typeof fragment.minimum === "number" ? { minimum: fragment.minimum } : {}),
        ...(typeof fragment.maximum === "number" ? { maximum: fragment.maximum } : {}),
        ...(quantity === "angle" ? { unit: "°" } : quantity === "length" ? { unit: "mm" } : {}),
        default: value,
      },
    ];
  });
