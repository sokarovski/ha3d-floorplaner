// Global application preferences (spec/architecture/application-preferences.md).
import Type from "typebox";
import type { Static } from "typebox";
import { hp } from "./annotations";
import { HaBindings, HaDashboard } from "./homeAssistant";
import { Choice, ColorRgb } from "./values";

export const Preferences = Type.Object(
  {
    appearance: Type.Object(
      {
        theme: Choice(
          [
            ["auto", "Auto"],
            ["light", "Light"],
            ["dark", "Dark"],
          ],
          {
            title: "Theme",
            default: "auto",
            order: 1,
            icons: { light: "sun", dark: "moon", auto: "monitor" },
          },
        ),
        /** The colour scheme (Phase 5.5): a preset of five base colours, or custom ones. */
        colorScheme: Choice(
          [
            ["blue", "Blue"],
            ["graphite", "Graphite"],
            ["green", "Green"],
            ["custom", "Custom"],
          ],
          { title: "Colours", default: "blue", order: 2, editor: "segmented" },
        ),
        /** Custom base colours (sRGB 0–255), used when the scheme is Custom. */
        customColors: Type.Optional(
          Type.Object(
            {
              neutral: ColorRgb({ title: "Neutral", order: 1 }),
              accent: ColorRgb({ title: "Accent", order: 2 }),
              danger: ColorRgb({ title: "Danger", order: 3 }),
              warning: ColorRgb({ title: "Warning", order: 4 }),
              success: ColorRgb({ title: "Success", order: 5 }),
            },
            {
              additionalProperties: false,
              title: "Custom colours",
              ...hp({ order: 3, visibleWhen: { property: "colorScheme", equals: "custom" } }),
            },
          ),
        ),
      },
      { additionalProperties: false, title: "Appearance", ...hp({ order: 1 }) },
    ),
    editor: Type.Object(
      {
        showGroundGrid: Type.Boolean({
          title: "Ground grid",
          default: true,
          ...hp({ editor: "toggle", order: 1 }),
        }),
        navigation: Choice(
          [
            ["trackpad", "Trackpad"],
            ["mouse", "Mouse"],
          ],
          { title: "Navigation", default: "trackpad", order: 2 },
        ),
        /** The house tree's share of the right column (Phase 7.4, drag the splitter); not shown in Settings. */
        treeShare: Type.Number({ minimum: 0.15, maximum: 0.85, default: 0.4, ...hp({ hidden: true }) }),
      },
      { additionalProperties: false, title: "Editor", ...hp({ order: 2 }) },
    ),
    /** The Home Assistant viewer setup (D23, spec/home-assistant/viewer-mvp.md); not shown in Settings. */
    homeAssistant: Type.Object(
      {
        viewer: Type.Object(
          {
            houseId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
            testEntityId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
          },
          { additionalProperties: false },
        ),
        /** Bindings per house ID: lights, objects, effects, rooms (D25, spec/home-assistant/bindings.md). */
        bindings: HaBindings,
        /** The room-cards dashboard, the room-to-tab mapping, and the floor widgets (spec/home-assistant/viewer-mvp.md#room-cards). */
        dashboard: HaDashboard,
      },
      { additionalProperties: false, title: "Home Assistant", ...hp({ hidden: true }) },
    ),
  },
  { additionalProperties: false, title: "Settings", ...hp({ title: "Settings" }) },
);

export type PreferencesValue = Static<typeof Preferences>;
export type ThemeChoice = PreferencesValue["appearance"]["theme"];

export const defaultPreferences: PreferencesValue = {
  appearance: { theme: "auto", colorScheme: "blue" },
  editor: { showGroundGrid: true, navigation: "trackpad", treeShare: 0.4 },
  homeAssistant: {
    viewer: { houseId: null, testEntityId: null },
    bindings: {},
    dashboard: {
      urlPath: null,
      areaTabs: {},
      areaViews: {},
      areaColumns: {},
      areaTitles: {},
      floorTabs: {},
      floorColumns: {},
      floorPositions: {},
    },
  },
};

export const PreferencesDocument = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    revision: Type.Integer({ minimum: 0 }),
    preferences: Preferences,
  },
  { $id: "urn:homeplan:schema:preferences-document:1", additionalProperties: false },
);

export type PreferencesDocumentValue = Static<typeof PreferencesDocument>;
