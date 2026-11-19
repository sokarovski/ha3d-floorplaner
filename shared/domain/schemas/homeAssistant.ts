// Home Assistant viewer configuration (D23, D25, spec/home-assistant/bindings.md). It is HA
// configuration, not builder data: it lives in the installation-global preferences next to the viewer setup,
// never in house.json.
import Type from "typebox";
import type { Static, TSchema } from "typebox";

/**
 * A Home Assistant dashboard action as HA's own action editor produces it, for example
 * `{ action: "toggle" }`, `{ action: "more-info" }`, or `{ action: "perform-action", perform_action, target, data }`.
 * Its other fields belong to HA and are kept as given.
 */
export const HaAction = Type.Object(
  { action: Type.String({ minLength: 1 }) },
  { additionalProperties: true },
);
export type HaActionValue = Static<typeof HaAction>;

// ---- Conditions (D25, spec/home-assistant/bindings.md#conditions) -------------------------------------------
// A subset of Home Assistant's dashboard card conditions with HA's own field names, plus `attribute` (an
// extension: test an attribute instead of the state). Nesting is fixed at three levels (a group inside a group);
// a cyclic schema is avoided so the preferences schema stays one plain JSON Schema.

const EntityId = Type.String({ minLength: 1 });
/** One state, or any of several (HA accepts both). */
const StateValues = Type.Union([Type.String(), Type.Array(Type.String(), { minItems: 1 })]);

/** `{ condition: "state", entity, attribute?, state }`: the entity's state (or attribute) is one of the values. */
const StateIsCondition = Type.Object(
  {
    condition: Type.Literal("state"),
    entity: EntityId,
    attribute: Type.Optional(Type.String({ minLength: 1 })),
    state: StateValues,
  },
  { additionalProperties: false },
);

/** `{ condition: "state", entity, attribute?, state_not }`: the entity's state (or attribute) is none of them. */
const StateNotCondition = Type.Object(
  {
    condition: Type.Literal("state"),
    entity: EntityId,
    attribute: Type.Optional(Type.String({ minLength: 1 })),
    state_not: StateValues,
  },
  { additionalProperties: false },
);

/** `{ condition: "numeric_state", entity, attribute?, above?, below? }`: strictly above and/or below. */
const NumericStateCondition = Type.Object(
  {
    condition: Type.Literal("numeric_state"),
    entity: EntityId,
    attribute: Type.Optional(Type.String({ minLength: 1 })),
    above: Type.Optional(Type.Number()),
    below: Type.Optional(Type.Number()),
  },
  { additionalProperties: false },
);

/** A test on one entity. */
export const HaEntityCondition = Type.Union([StateIsCondition, StateNotCondition, NumericStateCondition]);
export type HaEntityConditionValue = Static<typeof HaEntityCondition>;

const group = <T extends TSchema>(item: T) =>
  Type.Union([
    Type.Object(
      { condition: Type.Literal("and"), conditions: Type.Array(item) },
      { additionalProperties: false },
    ),
    Type.Object(
      { condition: Type.Literal("or"), conditions: Type.Array(item) },
      { additionalProperties: false },
    ),
  ]);

const InnerCondition = Type.Union([HaEntityCondition, group(HaEntityCondition)]);

/** A Home Assistant card condition (Q3 subset): `state`, `numeric_state`, and `and` / `or` groups. */
export const HaCondition = Type.Union([HaEntityCondition, group(InnerCondition)]);
export type HaConditionValue = Static<typeof HaCondition>;

// ---- Bindings (D25, spec/home-assistant/bindings.md) ------------------------------------------------------------

const StateEntity = Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()]));

/** What every clickable binding has: the entity it shows, an action per gesture, and when it is shown. */
const clickableFields = {
  /** The entity whose state the thing shows (and the default entity of its actions); null or absent for none. */
  stateEntityId: StateEntity,
  tapAction: Type.Optional(HaAction),
  holdAction: Type.Optional(HaAction),
  doubleTapAction: Type.Optional(HaAction),
  /** Shown (and reacting) only while this condition holds; absent means always. */
  visibleWhen: Type.Optional(HaCondition),
};

/** Bounds of the HA light overrides (13.6): the builder's own limits for a light's output and temperature. */
export const haLightLumens = { exclusiveMinimum: 0, maximum: 200000 } as const;
export const haLightKelvin = { minimum: 1500, maximum: 9000, step: 50 } as const;

/**
 * One light object's binding: the light entity whose state it shows, an action per gesture, and when it is shown
 * (a light whose condition fails is drawn off and ignores gestures). Today's `{ stateEntityId, …Action }` stays
 * valid. No variants: what the lamp is belongs to the builder; HA supplies what it is doing (Q1) and, since 13.6
 * (D25 Q1 amended 2026-11-18), may re-adjust two of its values without editing the house: `lumens` replaces the
 * light's output (the entity's brightness still scales it, once) and `kelvin` its default colour temperature,
 * used only while the entity reports no colour mode. Absent keeps the house value.
 */
export const HaLightBinding = Type.Object(
  {
    ...clickableFields,
    lumens: Type.Optional(Type.Number(haLightLumens)),
    kelvin: Type.Optional(Type.Number({ minimum: haLightKelvin.minimum, maximum: haLightKelvin.maximum })),
  },
  { additionalProperties: false },
);
export type HaLightBindingValue = Static<typeof HaLightBinding>;

// ---- State parameters (Phase 9.7, spec/home-assistant/bindings.md#state-parameters) ----------------------------
// An object binding can drive the live-state parameters its template declares (`x-homeplan.state`, D26): a door's
// open angle, a window's open mode, blinds closed. The app knows no parameter: the mapping turns an HA value into
// a boolean, number, or choice, and the viewer checks it against the parameter's type and limits.

/** A value a state parameter takes: on/off, a number, or a choice. */
export const HaStateValue = Type.Union([Type.Boolean(), Type.Number(), Type.String({ maxLength: 128 })]);
export type HaStateValueValue = Static<typeof HaStateValue>;

/** Most cases in one value table. */
export const maxStateCases = 16;

/** A number range for a linear map; `start` may be above `end` (an inverted map). */
const StateRange = Type.Object({ start: Type.Number(), end: Type.Number() }, { additionalProperties: false });

/**
 * How an HA value becomes the parameter's value. `table`: the value (as text) is one of a case's states → that
 * case's value, else `otherwise` (absent keeps the stored value). `threshold`: a number at or below `at` →
 * `atOrBelow`, above it → `above`. `linear`: a number mapped linearly from the `from` range onto the `to` range
 * (`{ start, end }`), clamped to `to`. `band` (10.4): a number from `from` to `to` (inclusive, either order) →
 * `inside`, any other number → `outside` (a venetian blind's tilt: open around 50, shut at 0 and at 100).
 */
export const HaStateMap = Type.Union([
  Type.Object(
    {
      kind: Type.Literal("table"),
      cases: Type.Array(
        Type.Object({ state: StateValues, value: HaStateValue }, { additionalProperties: false }),
        { maxItems: maxStateCases },
      ),
      otherwise: Type.Optional(HaStateValue),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    { kind: Type.Literal("threshold"), at: Type.Number(), atOrBelow: HaStateValue, above: HaStateValue },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: Type.Literal("linear"),
      from: StateRange,
      to: StateRange,
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: Type.Literal("band"),
      from: Type.Number(),
      to: Type.Number(),
      inside: HaStateValue,
      outside: HaStateValue,
    },
    { additionalProperties: false },
  ),
]);
export type HaStateMapValue = Static<typeof HaStateMap>;

const stateSourceFields = {
  entity: Type.Optional(EntityId),
  attribute: Type.Optional(Type.String({ minLength: 1 })),
  map: HaStateMap,
};

/** One entity value read and mapped: `entity` (absent: the binding's `stateEntityId`), `attribute`, `map`. */
export const HaStateSource = Type.Object(stateSourceFields, { additionalProperties: false });
export type HaStateSourceValue = Static<typeof HaStateSource>;

/**
 * One state parameter driven by an entity: `entity` (absent: the binding's `stateEntityId`), `attribute` (absent:
 * the state), and the `map`. An unknown, unavailable, or unmapped value keeps the stored parameter value.
 * `fallback` (10.5, optional): a second entity read only when the first gives no value (a window's "open" sensor
 * first, its "tilted" sensor second, both feeding one open mode).
 */
export const HaStateMapping = Type.Object(
  { ...stateSourceFields, fallback: Type.Optional(HaStateSource) },
  { additionalProperties: false },
);
export type HaStateMappingValue = Static<typeof HaStateMapping>;

/**
 * An Areable object's or a wall opening's binding: an AC opening its climate entity (8.3), a TV's player (8.8),
 * and the state parameters it drives, keyed by parameter name (9.7; optional, so earlier bindings stay valid).
 */
export const HaObjectBinding = Type.Object(
  { ...clickableFields, states: Type.Optional(Type.Record(Type.String({ minLength: 1 }), HaStateMapping)) },
  { additionalProperties: false },
);
export type HaObjectBindingValue = Static<typeof HaObjectBinding>;

/** Most sweep corners a room takes (K18, Q6). */
export const maxSweepCorners = 8;

/**
 * A corner of a room's outline, in the area's own frame (mm), so it survives moving or turning the area. The
 * viewer matches it to the nearest corner of the current outline (spec/home-assistant/bindings.md#presence).
 */
export const HaSweepCorner = Type.Object(
  { x: Type.Number(), y: Type.Number() },
  { additionalProperties: false },
);
export type HaSweepCornerValue = Static<typeof HaSweepCorner>;

/**
 * A room's presence / intrusion setting (8.6): while it is active, red light sweeps from the chosen corners. Active
 * means `when` holds, or without `when` the entity's state is "on" (motion, occupancy) or "triggered" (alarm).
 * Absent `corners` means the default two; an empty list sweeps from none (the room only tints).
 */
export const HaAreaPresence = Type.Object(
  {
    entityId: EntityId,
    when: Type.Optional(HaCondition),
    corners: Type.Optional(Type.Array(HaSweepCorner, { maxItems: maxSweepCorners })),
  },
  { additionalProperties: false },
);
export type HaAreaPresenceValue = Static<typeof HaAreaPresence>;

/**
 * A room's binding (its entity, actions, and condition; consumed from 8.1, 8.5, and 8.6) and its presence /
 * intrusion setting (8.6; optional, so bindings written before it stay valid).
 */
export const HaAreaBinding = Type.Object(
  {
    ...clickableFields,
    presence: Type.Optional(HaAreaPresence),
    /**
     * The HA area this room is (owner 2026-11-17), chosen in its Settings; absent means matched (the area of the
     * room's entities, else the HA area named like the room). It ranks suggestions and HA's entity pickers and
     * also names the room's dashboard tab.
     */
    haAreaId: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);
export type HaAreaBindingValue = Static<typeof HaAreaBinding>;

/**
 * A floor's binding (owner, 2026-11-18; spec/home-assistant/bindings.md#presence), keyed by the builder's floor ID:
 * `presenceWhen` gates every presence / intrusion sweep of the floor's rooms. While it does not hold, none of them
 * sweeps or tints, whatever their own entities say (for example: only while the alarm is armed). Absent: always.
 */
export const HaFloorBinding = Type.Object(
  { presenceWhen: Type.Optional(HaCondition) },
  { additionalProperties: false },
);
export type HaFloorBindingValue = Static<typeof HaFloorBinding>;

/** How an ambient effect looks while a variant holds; absent fields keep the authored value (8.4). */
export const HaEffectVariant = Type.Object(
  {
    when: HaCondition,
    kind: Type.Optional(Type.Union([Type.Literal("swirl"), Type.Literal("vapour")])),
    color: Type.Optional(
      Type.Array(Type.Integer({ minimum: 0, maximum: 255 }), { minItems: 3, maxItems: 3 }),
    ),
    direction: Type.Optional(Type.Union([Type.Literal("up"), Type.Literal("forward")])),
    sizeMm: Type.Optional(Type.Number({ minimum: 100, maximum: 3000 })),
  },
  { additionalProperties: false },
);
export type HaEffectVariantValue = Static<typeof HaEffectVariant>;

/**
 * An ambient effect's binding (keyed by its `fx_` ID): it runs only while `visibleWhen` holds, and the first
 * variant whose `when` holds changes its look. Effects take no gestures.
 */
export const HaEffectBinding = Type.Object(
  {
    visibleWhen: Type.Optional(HaCondition),
    variants: Type.Optional(Type.Array(HaEffectVariant, { maxItems: 8 })),
  },
  { additionalProperties: false },
);
export type HaEffectBindingValue = Static<typeof HaEffectBinding>;

const byId = <T extends TSchema>(binding: T) => Type.Record(Type.String({ minLength: 1 }), binding);

// ---- Bubbles (Phase 8.5, spec/home-assistant/bindings.md#bubbles) ------------------------------------------------
// One bubble design, two kinds (owner Q4): room bubbles (a list per area, drawn above the room while their
// condition holds) and placed bubbles (on a point, an object, or a light; always present unless their condition
// hides them). A bubble is a clickable binding plus what it shows.

/** What a bubble is for; it sets the default icon, format, and tap action (custom sets none). */
export const haBubblePresets = ["temperature", "humidity", "light", "presence", "state", "custom"] as const;
export type HaBubblePreset = (typeof haBubblePresets)[number];

/** What a bubble shows next to its icon: the entity's value (with its unit), its state as text, or nothing. */
export const haBubbleFormats = ["value", "state", "icon"] as const;
export type HaBubbleFormat = (typeof haBubbleFormats)[number];

const bubbleFields = {
  preset: Type.Union([
    Type.Literal("temperature"),
    Type.Literal("humidity"),
    Type.Literal("light"),
    Type.Literal("presence"),
    Type.Literal("state"),
    Type.Literal("custom"),
  ]),
  ...clickableFields,
  /** Show this attribute instead of the state (for example a climate entity's `current_temperature`). */
  attribute: Type.Optional(Type.String({ minLength: 1 })),
  /** An `ha-icon` name (`mdi:thermometer`); absent uses the entity's own icon, else the preset's. */
  icon: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  format: Type.Union([Type.Literal("value"), Type.Literal("state"), Type.Literal("icon")]),
  /** `bubble` (absent): a pill on the theme's card colour; `bare`: icon and text only, no background. */
  style: Type.Optional(Type.Union([Type.Literal("bubble"), Type.Literal("bare")])),
};

/** A room bubble: one entry of a room's list, drawn above the room in a row while its condition holds. */
export const HaRoomBubble = Type.Object(
  { id: Type.String({ minLength: 1 }), ...bubbleFields },
  { additionalProperties: false },
);
export type HaRoomBubbleValue = Static<typeof HaRoomBubble>;

const PlanPoint = Type.Object(
  { x: Type.Number(), y: Type.Number(), h: Type.Number() },
  { additionalProperties: false },
);

/** Where a placed bubble sits: a free point in a room (plan mm), or on an object or a light (it moves with it). */
export const HaBubbleAnchor = Type.Union([
  Type.Object(
    { kind: Type.Literal("point"), areaId: Type.String({ minLength: 1 }), positionMm: PlanPoint },
    { additionalProperties: false },
  ),
  Type.Object(
    { kind: Type.Literal("object"), objectId: Type.String({ minLength: 1 }) },
    { additionalProperties: false },
  ),
  Type.Object(
    { kind: Type.Literal("light"), lightId: Type.String({ minLength: 1 }) },
    { additionalProperties: false },
  ),
]);
export type HaBubbleAnchorValue = Static<typeof HaBubbleAnchor>;

/** A placed bubble (keyed by its `hb_` ID): always present unless `visibleWhen` hides it. */
export const HaPlacedBubble = Type.Object(
  { ...bubbleFields, anchor: HaBubbleAnchor },
  { additionalProperties: false },
);
export type HaPlacedBubbleValue = Static<typeof HaPlacedBubble>;

/** What every bubble shows and does, room or placed (without its ID and anchor). */
export type HaBubbleContentValue = Omit<HaRoomBubbleValue, "id">;

/** One house's bubbles: room bubble lists by area ID, placed bubbles by bubble ID. */
export const HaHouseBubbles = Type.Object(
  {
    rooms: Type.Record(Type.String({ minLength: 1 }), Type.Array(HaRoomBubble, { maxItems: 12 })),
    placed: byId(HaPlacedBubble),
  },
  { additionalProperties: false },
);
export type HaHouseBubblesValue = Static<typeof HaHouseBubbles>;

export const emptyHouseBubbles = (): HaHouseBubblesValue => ({ rooms: {}, placed: {} });

/** The kinds of bindable things; each kind is keyed by the builder's stable ID. */
export const haBindingKinds = ["lights", "objects", "effects", "areas"] as const;
export type HaBindingKind = (typeof haBindingKinds)[number];

/**
 * One house's bindings, by kind and by the builder's stable ID (moves and renames keep them). Stored documents
 * from before D25 have only `lights`; the server fills the other kinds in on read.
 */
export const HaHouseBindings = Type.Object(
  {
    lights: byId(HaLightBinding),
    objects: byId(HaObjectBinding),
    effects: byId(HaEffectBinding),
    areas: byId(HaAreaBinding),
    /** Room and placed bubbles (8.5); stored documents from before 8.5 get empty ones on read. */
    bubbles: HaHouseBubbles,
    /** Floor bindings by floor ID (the presence gate); optional, so bindings stored before it stay valid. */
    floors: Type.Optional(byId(HaFloorBinding)),
  },
  { additionalProperties: false },
);
export type HaHouseBindingsValue = Static<typeof HaHouseBindings>;

/** A house's bindings in a preferences patch: the kinds listed replace that kind whole; the others are kept. */
export const HaHouseBindingsPatch = Type.Object(
  {
    lights: Type.Optional(byId(HaLightBinding)),
    objects: Type.Optional(byId(HaObjectBinding)),
    effects: Type.Optional(byId(HaEffectBinding)),
    areas: Type.Optional(byId(HaAreaBinding)),
    bubbles: Type.Optional(HaHouseBubbles),
    floors: Type.Optional(byId(HaFloorBinding)),
  },
  { additionalProperties: false },
);
export type HaHouseBindingsPatchValue = Static<typeof HaHouseBindingsPatch>;

export const emptyHouseBindings = (): HaHouseBindingsValue => ({
  lights: {},
  objects: {},
  effects: {},
  areas: {},
  bubbles: emptyHouseBubbles(),
});

/**
 * A saved room camera: the orbit target in plan millimetres, the distance to it in metres, and the orbit angles
 * in radians (Three.js azimuth and polar angle). Plan coordinates keep it valid when the view is re-centered.
 */
export const HaAreaView = Type.Object(
  {
    target: Type.Object(
      { x: Type.Number(), y: Type.Number(), h: Type.Number() },
      { additionalProperties: false },
    ),
    distance: Type.Number({ exclusiveMinimum: 0 }),
    azimuth: Type.Number(),
    polar: Type.Number(),
  },
  { additionalProperties: false },
);
export type HaAreaViewValue = Static<typeof HaAreaView>;

/** Where a floor's widgets sit beside the house (13.7): left and right take 1–2 columns, top and bottom 1–4. */
export const haFloorWidgetPositions = ["left", "right", "top", "bottom"] as const;
export const HaFloorWidgetPosition = Type.Union([
  Type.Literal("left"),
  Type.Literal("right"),
  Type.Literal("top"),
  Type.Literal("bottom"),
]);
export type HaFloorWidgetPositionValue = Static<typeof HaFloorWidgetPosition>;

/**
 * How the viewer's camera is driven (Phase 14.6, spec/home-assistant/viewer-mvp.md#houseviewer): the builder's
 * Trackpad or Mouse gesture map (D16), or Touch (one finger orbits, two pan, pinch zooms).
 */
export const HaNavigation = Type.Union([
  Type.Literal("trackpad"),
  Type.Literal("mouse"),
  Type.Literal("touch"),
]);
export type HaNavigationValue = Static<typeof HaNavigation>;

/**
 * The HA dashboard whose tabs (views) hold each room's cards, and which tab each room opens. `urlPath` is the
 * dashboard's URL path ("lovelace" is the default dashboard); a tab is named by its `path`, else its `title`.
 * Rooms without an entry fall back to matching the tab to the room name.
 */
export const HaDashboard = Type.Object(
  {
    urlPath: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    areaTabs: Type.Record(
      Type.String({ minLength: 1 }),
      Type.Record(Type.String({ minLength: 1 }), Type.String({ minLength: 1 })),
    ),
    /**
     * How many section columns wide each room's panel is, per house ID and area ID; rooms without an entry use
     * one column (owner 2026-11-17: a room setting, replacing the house-wide `panelColumns`).
     */
    areaColumns: Type.Record(
      Type.String({ minLength: 1 }),
      Type.Record(Type.String({ minLength: 1 }), Type.Union([Type.Literal(1), Type.Literal(2)])),
    ),
    /**
     * Rooms whose title is shown above their cards, per house ID and area ID (14.4; absent: hidden, the default).
     * Optional, so settings stored before 14.4 stay valid.
     */
    areaTitles: Type.Optional(
      Type.Record(
        Type.String({ minLength: 1 }),
        Type.Record(Type.String({ minLength: 1 }), Type.Literal(true)),
      ),
    ),
    /** The saved camera of each room, per house ID and area ID; rooms without one are framed automatically. */
    areaViews: Type.Record(
      Type.String({ minLength: 1 }),
      Type.Record(Type.String({ minLength: 1 }), HaAreaView),
    ),
    /**
     * Floor widgets (13.7, spec/home-assistant/viewer-mvp.md#floor-widgets), per house ID and floor ID: the tab
     * whose cards are drawn beside the house (absent: no widgets), how many section columns wide they are (absent:
     * 1), and on which side (absent: right). Optional, so settings stored before 13.7 stay valid.
     */
    floorTabs: Type.Optional(
      Type.Record(
        Type.String({ minLength: 1 }),
        Type.Record(Type.String({ minLength: 1 }), Type.String({ minLength: 1 })),
      ),
    ),
    floorColumns: Type.Optional(
      Type.Record(
        Type.String({ minLength: 1 }),
        Type.Record(
          Type.String({ minLength: 1 }),
          Type.Union([Type.Literal(1), Type.Literal(2), Type.Literal(3), Type.Literal(4)]),
        ),
      ),
    ),
    floorPositions: Type.Optional(
      Type.Record(
        Type.String({ minLength: 1 }),
        Type.Record(Type.String({ minLength: 1 }), HaFloorWidgetPosition),
      ),
    ),
    /**
     * The viewer's navigation (14.6), installation-global (owner, 2026-11-18). Absent: Touch on a touch-first
     * device, else Trackpad. Optional, so settings stored before 14.6 stay valid.
     */
    navigation: Type.Optional(HaNavigation),
    /**
     * The view a multi-floor house opens on (Phase 16.1, owner 2026-11-18; spec/home-assistant/viewer-mvp.md#floors-and-the-whole-house),
     * per house ID: a floor ID. Absent (the default, "Whole house"): the whole-house view. A floor that no longer
     * exists falls back to the whole house. Optional, so settings stored before 16.1 stay valid.
     */
    mainViews: Type.Optional(Type.Record(Type.String({ minLength: 1 }), Type.String({ minLength: 1 }))),
  },
  { additionalProperties: false },
);
export type HaDashboardValue = Static<typeof HaDashboard>;

/** Bindings of every house, keyed by house ID, so switching the shown house never mixes them. */
export const HaBindings = Type.Record(Type.String({ minLength: 1 }), HaHouseBindings);
export type HaBindingsValue = Static<typeof HaBindings>;

/** The bindings part of a preferences patch: houses listed here are merged by kind; other houses are kept. */
export const HaBindingsPatch = Type.Record(Type.String({ minLength: 1 }), HaHouseBindingsPatch);
export type HaBindingsPatchValue = Static<typeof HaBindingsPatch>;
