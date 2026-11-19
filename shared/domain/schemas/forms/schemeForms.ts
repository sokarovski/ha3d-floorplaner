// The /ds Themes playground's colour form (Phase 5.5): the five base colours of a scheme.
import Type from "typebox";
import { hp } from "../annotations";
import { ColorRgb } from "../values";

export const baseColorsForm = Type.Object(
  {
    neutral: ColorRgb({ title: "Neutral", order: 1 }),
    accent: ColorRgb({ title: "Accent", order: 2 }),
    danger: ColorRgb({ title: "Danger", order: 3 }),
    warning: ColorRgb({ title: "Warning", order: 4 }),
    success: ColorRgb({ title: "Success", order: 5 }),
  },
  { additionalProperties: false, title: "Base colours", ...hp({ title: "Base colours" }) },
);
